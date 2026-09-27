import { describe, expect, it } from 'vitest';
import {
  canTransition,
  freeCancellationUntil,
  isLateCancellation,
  newReference,
} from '../../src/modules/bookings/domain/booking-rules.js';
import { renderBookingMessage } from '../../src/modules/notifications/domain/templates.js';

describe('booking rules', () => {
  it('generates unambiguous 8-character references', () => {
    const refs = new Set(Array.from({ length: 2000 }, () => newReference()));
    expect(refs.size).toBe(2000);
    for (const ref of refs) expect(ref).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
  });

  it('computes the free cancellation window', () => {
    const start = new Date('2026-10-10T18:00:00Z');
    expect(freeCancellationUntil(start, { cutoffHours: 24 }).toISOString()).toBe(
      '2026-10-09T18:00:00.000Z',
    );
    expect(isLateCancellation(start, { cutoffHours: 24 }, new Date('2026-10-09T17:59:59Z'))).toBe(
      false,
    );
    expect(isLateCancellation(start, { cutoffHours: 24 }, new Date('2026-10-09T18:00:01Z'))).toBe(
      true,
    );
    expect(isLateCancellation(start, { cutoffHours: 0 }, new Date('2026-10-10T17:00:00Z'))).toBe(
      false,
    );
  });

  it('allows only lifecycle transitions of ADR-0005', () => {
    expect(canTransition('HELD', 'CONFIRMED')).toBe(true);
    expect(canTransition('HELD', 'EXPIRED')).toBe(true);
    expect(canTransition('CONFIRMED', 'COMPLETED')).toBe(true);
    expect(canTransition('EXPIRED', 'CONFIRMED')).toBe(false);
    expect(canTransition('CANCELLED', 'CONFIRMED')).toBe(false);
    expect(canTransition('COMPLETED', 'CANCELLED')).toBe(false);
  });
});

describe('notification templates', () => {
  const facts = {
    reference: 'ABCD2345',
    venueName: { ar: 'نادي الشمس', en: 'Sun Club' },
    resourceName: { ar: 'ملعب 1', en: 'Court 1' },
    start: new Date('2026-10-10T15:30:00Z'),
    timeZone: 'Asia/Amman',
    price: { amount: 25000, currency: 'JOD' },
  };

  it('renders Arabic with Western digits, venue-local time and JOD formatting', () => {
    const text = renderBookingMessage('bookingConfirmed', 'ar', facts);
    expect(text).toContain('ABCD2345');
    expect(text).toContain('نادي الشمس');
    expect(text).toContain('2026-10-10');
    expect(text).toContain('18:30');
    expect(text).toContain('25.000 د.أ');
  });

  it('renders English and a missing price', () => {
    const text = renderBookingMessage('venueNewBooking', 'en', {
      ...facts,
      price: null,
      customerName: 'Lina',
      customerPhone: '+962790000000',
    });
    expect(text).toContain('Court 1');
    expect(text).toContain('Lina (+962790000000)');
    expect(text).toContain('price not set');
  });
});
