import { depositAmount } from '../../finance/index.js';
import type { VenueRow } from '../../venues/index.js';

/** What a player must pay now, and to whom (stored as a snapshot on the payment). */
export interface PaymentStart {
  readonly provider: 'CLIQ_MANUAL';
  readonly amount: number;
  readonly currency: string;
  readonly payeeAlias: string;
  readonly payeeHolder: string | null;
}

/**
 * How a marketplace booking gets paid (ADR-0018). The booking flow only depends on this; a card
 * gateway can be added later as another implementation. Returns null when the venue does not take
 * this kind of payment (then the booking is paid at the venue).
 */
export interface PaymentProvider {
  start(venue: VenueRow, price: { amount: number; currency: string }): PaymentStart | null;
}

/**
 * CliQ straight to the venue (plan §4): the player transfers the deposit to the venue's alias and
 * sends the reference; the venue confirms it arrived. The platform never holds the money.
 */
export const cliqManualProvider: PaymentProvider = {
  start(venue, price) {
    if (!venue.cliqAlias) return null;
    const amount = depositAmount(price.amount, venue.depositPercentage);
    if (amount <= 0) return null;
    return {
      provider: 'CLIQ_MANUAL',
      amount,
      currency: price.currency,
      payeeAlias: venue.cliqAlias,
      payeeHolder: venue.cliqAliasHolder,
    };
  },
};
