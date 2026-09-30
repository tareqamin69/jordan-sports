import { describe, expect, it } from 'vitest';
import {
  earningOf,
  ibanChecksumValid,
  maskIban,
  nextPayoutDate,
  payoutCutoff,
} from '../../src/modules/finance/domain/payout-rules.js';
import { commissionAmount, refundAmount } from '../../src/modules/payments/domain/payment-rules.js';
import {
  cardBrand,
  luhnValid,
  mockCardOutcome,
} from '../../src/modules/payments/domain/test-cards.js';

describe('refunds (ADR-0020)', () => {
  it('refunds everything unless the player cancels late', () => {
    for (const reason of ['customer_free', 'venue', 'admin', 'expired'] as const) {
      expect(refundAmount(20_000, reason, 0)).toBe(20_000);
    }
  });
  it('applies the venue late-refund percentage, rounding half up once', () => {
    expect(refundAmount(20_000, 'customer_late', 0)).toBe(0);
    expect(refundAmount(20_000, 'customer_late', 50)).toBe(10_000);
    expect(refundAmount(20_000, 'customer_late', 100)).toBe(20_000);
    expect(refundAmount(12_345, 'customer_late', 50)).toBe(6_173);
  });
  it('commission is on what the venue keeps', () => {
    expect(commissionAmount(20_000, 800)).toBe(1_600);
    expect(commissionAmount(10_000, 800)).toBe(800);
    expect(commissionAmount(0, 800)).toBe(0);
  });
});

describe('mock gateway test cards', () => {
  const now = new Date('2026-09-30T10:00:00Z');
  it('checks Luhn and brands', () => {
    expect(luhnValid('4242424242424242')).toBe(true);
    expect(luhnValid('4242424242424241')).toBe(false);
    expect(cardBrand('4242424242424242')).toBe('visa');
    expect(cardBrand('5555555555554444')).toBe('mastercard');
    expect(cardBrand('378282246310005')).toBeNull();
  });
  it('answers like a gateway', () => {
    const card = (number: string, expiry = '12/40', cvc = '123') =>
      mockCardOutcome({ number, expiry, cvc }, now);
    expect(card('4242 4242 4242 4242')).toEqual({
      status: 'succeeded',
      brand: 'visa',
      last4: '4242',
    });
    expect(card('4000000000000002')).toEqual({ status: 'failed', failureCode: 'card_declined' });
    expect(card('4000000000009995')).toEqual({
      status: 'failed',
      failureCode: 'insufficient_funds',
    });
    expect(card('4242424242424242', '08/26')).toEqual({
      status: 'failed',
      failureCode: 'expired_card',
    });
    expect(card('4242424242424242', '13/30')).toMatchObject({ failureCode: 'invalid_expiry' });
    expect(card('4242424242424242', '12/40', '12')).toMatchObject({ failureCode: 'invalid_cvc' });
    // Any other valid-looking card is declined: nothing real ever "works" on the mock.
    expect(card('4111111111111111')).toEqual({ status: 'failed', failureCode: 'card_declined' });
  });
});

describe('payouts', () => {
  it('weeks start on Sunday (Amman time)', () => {
    // Wednesday 2026-09-30 → Sunday 2026-09-27 00:00 in Amman (UTC+3).
    expect(payoutCutoff(new Date('2026-09-30T10:00:00Z'), 'Asia/Amman').toISOString()).toBe(
      '2026-09-26T21:00:00.000Z',
    );
    // A Sunday is its own cutoff.
    expect(payoutCutoff(new Date('2026-09-27T12:00:00Z'), 'Asia/Amman').toISOString()).toBe(
      '2026-09-26T21:00:00.000Z',
    );
    expect(nextPayoutDate(new Date('2026-09-30T10:00:00Z'), 'Asia/Amman')).toBe('2026-10-04');
  });
  it('validates Jordanian IBANs with the ISO 13616 checksum', () => {
    expect(ibanChecksumValid('JO94CBJO0010000000000131000302')).toBe(true);
    expect(ibanChecksumValid('JO95CBJO0010000000000131000302')).toBe(false);
    expect(maskIban('JO94CBJO0010000000000131000302')).toBe('JO94 •••• •••• 0302');
  });
  it('classifies each paid booking', () => {
    const now = new Date('2026-09-30T10:00:00Z');
    const cutoff = payoutCutoff(now, 'Asia/Amman');
    const base = {
      paid: 20_000,
      refunded: 0,
      commissionBps: 800,
      status: 'COMPLETED',
      cancelledAt: null,
      paidOut: false,
      now,
      cutoff,
    };
    expect(earningOf({ ...base, end: new Date('2026-09-20T18:00:00Z') })).toEqual({
      gross: 20_000,
      commission: 1_600,
      net: 18_400,
      status: 'due',
    });
    expect(earningOf({ ...base, end: new Date('2026-09-29T18:00:00Z') }).status).toBe('pending');
    expect(
      earningOf({ ...base, status: 'CONFIRMED', end: new Date('2026-10-02T18:00:00Z') }).status,
    ).toBe('upcoming');
    // A late cancellation with half refunded: the venue keeps half, settled when cancelled.
    expect(
      earningOf({
        ...base,
        status: 'CANCELLED',
        refunded: 10_000,
        cancelledAt: new Date('2026-09-21T10:00:00Z'),
        end: new Date('2026-10-02T18:00:00Z'),
      }),
    ).toEqual({ gross: 10_000, commission: 800, net: 9_200, status: 'due' });
    expect(
      earningOf({ ...base, paidOut: true, end: new Date('2026-09-20T18:00:00Z') }).status,
    ).toBe('paid');
  });
});
