import { BRAND_NAME } from '@jordan-sports/brand';
import { messages, type Locale } from '@jordan-sports/i18n';
import { formatMoney } from '@jordan-sports/money';
import { DateTime } from 'luxon';
import { createTranslator } from 'use-intl/core';

export type TemplateName =
  | 'bookingConfirmed'
  | 'bookingCancelled'
  | 'bookingCancelledByVenue'
  | 'venueNewBooking'
  | 'venueBookingCancelled';

export interface BookingMessageFacts {
  readonly reference: string;
  readonly venueName: { ar?: string; en?: string };
  readonly resourceName: { ar?: string; en?: string };
  readonly start: Date;
  readonly timeZone: string;
  readonly price: { amount: number; currency: string } | null;
  readonly customerName?: string | null;
  readonly customerPhone?: string | null;
  readonly reason?: string | null;
  /** Going back to the player's card after a cancellation. */
  readonly refund?: { amount: number; currency: string } | null;
}

function pick(text: { ar?: string; en?: string }, locale: Locale): string {
  return text[locale] ?? text.ar ?? text.en ?? '';
}

/** Renders a notification in the recipient's language (Western digits, venue-local time). */
export function renderBookingMessage(
  template: TemplateName,
  locale: Locale,
  facts: BookingMessageFacts,
): string {
  const t = createTranslator({ locale, messages: messages[locale], namespace: 'notifications' });
  const local = DateTime.fromJSDate(facts.start, { zone: facts.timeZone });
  return t(template, {
    reference: facts.reference,
    venue: pick(facts.venueName, locale),
    resource: pick(facts.resourceName, locale),
    date: local.toFormat('yyyy-MM-dd'),
    time: local.toFormat('HH:mm'),
    price: facts.price ? formatMoney(facts.price, locale) : t('noPrice'),
    customer: facts.customerName ?? '-',
    phone: facts.customerPhone ?? '-',
    reason: facts.reason ?? '-',
    refundStatus: facts.refund && facts.refund.amount > 0 ? 'some' : 'none',
    refund: facts.refund ? formatMoney(facts.refund, locale) : '',
    appName: BRAND_NAME[locale],
  });
}
