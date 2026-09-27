import { DateTime } from 'luxon';

/**
 * Price quotes (docs/architecture.md §H, ADR-0014). Pure and deterministic.
 *
 * A slot is priced by the rule whose band contains the slot's START, on the venue's business day.
 * Precedence: special periods (dated rules) over regular bands, then higher priority, then the most
 * recently created rule.
 */

export interface PriceRule {
  readonly id: string;
  readonly daysOfWeek: readonly number[];
  readonly startMinute: number;
  readonly endMinute: number;
  readonly dateFrom: string | null;
  readonly dateTo: string | null;
  readonly priority: number;
  readonly currency: string;
  readonly createdAt: Date;
  /** Duration in minutes → amount in minor units. */
  readonly amounts: ReadonlyMap<number, number>;
}

export interface SlotPosition {
  /** Business date of the slot (YYYY-MM-DD). */
  readonly businessDate: string;
  /** ISO weekday of the business date. */
  readonly weekday: number;
  /** Minutes from local midnight of the business date to the slot start (≥ 1440 after midnight). */
  readonly startOffsetMinute: number;
  readonly durationMinutes: number;
}

export interface Quote {
  readonly ruleId: string;
  readonly amount: number;
  readonly currency: string;
}

/** Position of a slot start on its business day. */
export function slotPosition(
  start: Date,
  durationMinutes: number,
  businessDate: string,
  zone: string,
): SlotPosition {
  const midnight = DateTime.fromISO(businessDate, { zone });
  const local = DateTime.fromJSDate(start, { zone });
  const offset = Math.round(local.diff(midnight, 'minutes').minutes);
  return { businessDate, weekday: midnight.weekday, startOffsetMinute: offset, durationMinutes };
}

export function matches(rule: PriceRule, slot: SlotPosition): boolean {
  return (
    rule.daysOfWeek.includes(slot.weekday) &&
    rule.startMinute <= slot.startOffsetMinute &&
    slot.startOffsetMinute < rule.endMinute &&
    (rule.dateFrom === null ||
      (rule.dateFrom <= slot.businessDate &&
        slot.businessDate <= (rule.dateTo ?? rule.dateFrom))) &&
    rule.amounts.has(slot.durationMinutes)
  );
}

export function quote(rules: readonly PriceRule[], slot: SlotPosition): Quote | null {
  const best = rules
    .filter((r) => matches(r, slot))
    .sort(
      (a, b) =>
        Number(b.dateFrom !== null) - Number(a.dateFrom !== null) ||
        b.priority - a.priority ||
        b.createdAt.getTime() - a.createdAt.getTime() ||
        (a.id < b.id ? 1 : -1),
    )[0];
  if (!best) return null;
  return {
    ruleId: best.id,
    amount: best.amounts.get(slot.durationMinutes)!,
    currency: best.currency,
  };
}
