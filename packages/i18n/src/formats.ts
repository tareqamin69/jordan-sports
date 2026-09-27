/**
 * Named formats for next-intl (`format.dateTime(d, 'short')`). Every format pins the Latin
 * numbering system: Western digits are an approved product decision for both locales.
 *
 * Convention: do not use ICU `{n, number}` or `#` in messages to display numbers (they would use
 * the locale's default digits); pass numbers pre-formatted as strings instead.
 */
export const intlFormats = {
  dateTime: {
    short: { dateStyle: 'medium', timeStyle: 'short', numberingSystem: 'latn' },
    date: { dateStyle: 'medium', numberingSystem: 'latn' },
    dayMonth: { weekday: 'long', day: 'numeric', month: 'long', numberingSystem: 'latn' },
    weekdayShort: { weekday: 'short', day: 'numeric', numberingSystem: 'latn' },
    time: { hour: 'numeric', minute: '2-digit', numberingSystem: 'latn' },
  },
  number: {
    integer: { maximumFractionDigits: 0, numberingSystem: 'latn' },
  },
} as const satisfies {
  dateTime: Record<string, Intl.DateTimeFormatOptions>;
  number: Record<string, Intl.NumberFormatOptions>;
};
