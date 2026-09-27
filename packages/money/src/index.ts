/**
 * Exact money handling (ADR-0006). Amounts are integers in minor units (JOD: fils, 1 JOD = 1000).
 * No floating-point arithmetic is ever used on amounts; every function checks its inputs are safe
 * integers.
 */

export interface Money {
  readonly amount: number;
  readonly currency: string;
}

/** Minor units per currency (ISO 4217 exponent). */
export const currencyExponent: Readonly<Record<string, number>> = {
  JOD: 3,
  USD: 2,
  EUR: 2,
  SAR: 2,
  AED: 2,
};

export function exponentOf(currency: string): number {
  const exponent = currencyExponent[currency];
  if (exponent === undefined) throw new Error(`Unsupported currency ${currency}`);
  return exponent;
}

function assertAmount(amount: number): void {
  if (!Number.isSafeInteger(amount)) throw new Error('Amount must be a safe integer (minor units)');
}

export function money(amount: number, currency: string): Money {
  assertAmount(amount);
  exponentOf(currency);
  return { amount, currency };
}

export function add(a: Money, b: Money): Money {
  if (a.currency !== b.currency) throw new Error('Currency mismatch');
  return money(a.amount + b.amount, a.currency);
}

export function subtract(a: Money, b: Money): Money {
  if (a.currency !== b.currency) throw new Error('Currency mismatch');
  return money(a.amount - b.amount, a.currency);
}

/**
 * `amount × basisPoints / 10000`, rounded half-up (away from zero for halves) to the minor unit.
 * Uses BigInt so intermediate products cannot lose precision.
 */
export function percentOf(amount: number, basisPoints: number): number {
  assertAmount(amount);
  if (!Number.isSafeInteger(basisPoints) || basisPoints < 0)
    throw new Error('Basis points must be a non-negative integer');
  const product = BigInt(amount) * BigInt(basisPoints);
  const sign = product < 0n ? -1n : 1n;
  const abs = product * sign;
  const rounded = (abs + 5000n) / 10000n;
  return Number(rounded * sign);
}

/**
 * Splits `total` into parts proportional to `weights` using the largest-remainder method. Parts
 * always sum exactly to `total`; ties go to the earliest part (deterministic).
 * Example: allocate(10000, [1, 1, 1]) → [3334, 3333, 3333].
 */
export function allocate(total: number, weights: readonly number[]): number[] {
  assertAmount(total);
  if (total < 0) throw new Error('Total must be non-negative');
  if (weights.length === 0 || weights.some((w) => !Number.isSafeInteger(w) || w < 0))
    throw new Error('Invalid weights');
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum === 0) throw new Error('Weights must not all be zero');
  const big = BigInt(total);
  const bigSum = BigInt(sum);
  const parts = weights.map((w) => (big * BigInt(w)) / bigSum);
  const remainders = weights.map((w, i) => ({ i, r: (big * BigInt(w)) % bigSum }));
  let left = Number(big - parts.reduce((a, b) => a + b, 0n));
  remainders.sort((a, b) => (a.r === b.r ? a.i - b.i : a.r > b.r ? -1 : 1));
  for (const { i } of remainders) {
    if (left === 0) break;
    parts[i] = parts[i]! + 1n;
    left -= 1;
  }
  return parts.map(Number);
}

/**
 * Parses a user-entered major-unit amount ("25", "25.5", "25.125") into minor units. Accepts
 * Western and Eastern Arabic digits and the Arabic decimal separator. Returns null when invalid or
 * when it has more decimals than the currency allows.
 */
export function parseMajor(input: string, currency: string): number | null {
  const exponent = exponentOf(currency);
  const normalized = input
    .trim()
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace('٫', '.')
    .replace(/,/g, '');
  const match = /^(\d{1,12})(?:\.(\d+))?$/.exec(normalized);
  if (!match) return null;
  const fraction = match[2] ?? '';
  if (fraction.length > exponent) return null;
  const amount = Number(match[1]) * 10 ** exponent + Number(fraction.padEnd(exponent, '0') || '0');
  return Number.isSafeInteger(amount) ? amount : null;
}

/** Major-unit string with the currency's full precision, e.g. 25000 JOD → "25.000". */
export function toMajorString(amount: number, currency: string, grouping = true): string {
  assertAmount(amount);
  const exponent = exponentOf(currency);
  const negative = amount < 0;
  const abs = Math.abs(amount);
  const divisor = 10 ** exponent;
  const integer = Math.floor(abs / divisor).toString();
  const fraction = (abs % divisor).toString().padStart(exponent, '0');
  const grouped = grouping ? integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : integer;
  return `${negative ? '-' : ''}${grouped}${exponent > 0 ? `.${fraction}` : ''}`;
}

const symbols: Record<string, { ar: string; en: string }> = {
  JOD: { ar: 'د.أ', en: 'JOD' },
};

/**
 * Display format (approved product decision): Arabic "25.000 د.أ", English "JOD 25.000", always
 * with the currency's full precision and Western digits. Display never changes stored values.
 */
export function formatMoney(value: Money, locale: string): string {
  const number = toMajorString(value.amount, value.currency);
  const symbol = symbols[value.currency] ?? { ar: value.currency, en: value.currency };
  return locale === 'ar' ? `${number} ${symbol.ar}` : `${symbol.en} ${number}`;
}
