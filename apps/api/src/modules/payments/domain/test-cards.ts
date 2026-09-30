import type { CardBrand } from './gateway.js';

/**
 * Test cards of the mock gateway (staging only). Any other card that passes the checks is
 * declined, so nothing that looks like a real card ever "works".
 */
export const TEST_CARDS: Readonly<Record<string, { outcome: 'succeeded' | string }>> = {
  '4242424242424242': { outcome: 'succeeded' },
  '5555555555554444': { outcome: 'succeeded' },
  '4000000000000002': { outcome: 'card_declined' },
  '4000000000009995': { outcome: 'insufficient_funds' },
};

export function luhnValid(number: string): boolean {
  if (!/^[0-9]{12,19}$/.test(number)) return false;
  let sum = 0;
  for (let i = 0; i < number.length; i++) {
    let d = Number(number[number.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

export function cardBrand(number: string): CardBrand | null {
  if (/^4/.test(number)) return 'visa';
  if (/^(5[1-5]|2(2[2-9]|[3-6][0-9]|7[01]|720))/.test(number)) return 'mastercard';
  return null;
}

export type MockCardOutcome =
  | { status: 'succeeded'; brand: CardBrand; last4: string }
  | { status: 'failed'; failureCode: string };

/** How the mock gateway answers a card typed on its test page. */
export function mockCardOutcome(
  input: { number: string; expiry: string; cvc: string },
  now: Date,
): MockCardOutcome {
  const number = input.number.replace(/[\s-]/g, '');
  const brand = cardBrand(number);
  if (!luhnValid(number) || !brand) return { status: 'failed', failureCode: 'invalid_card' };
  const m = /^(0[1-9]|1[0-2])\s*\/\s*([0-9]{2})$/.exec(input.expiry.trim());
  if (!m) return { status: 'failed', failureCode: 'invalid_expiry' };
  const endOfMonth = new Date(Date.UTC(2000 + Number(m[2]), Number(m[1]), 1));
  if (endOfMonth <= now) return { status: 'failed', failureCode: 'expired_card' };
  if (!/^[0-9]{3}$/.test(input.cvc.trim())) return { status: 'failed', failureCode: 'invalid_cvc' };
  const outcome = TEST_CARDS[number]?.outcome ?? 'card_declined';
  return outcome === 'succeeded'
    ? { status: 'succeeded', brand, last4: number.slice(-4) }
    : { status: 'failed', failureCode: outcome };
}
