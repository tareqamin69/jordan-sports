/** Picks the text for the UI locale, falling back to Arabic, then English. */
export function pick(
  text: { ar?: string; en?: string } | null | undefined,
  locale: string,
): string {
  if (!text) return '';
  return (locale === 'en' ? (text.en ?? text.ar) : (text.ar ?? text.en)) ?? '';
}

/** Joins items with the locale's comma ("، " in Arabic, ", " in English). */
export function joinList(items: string[], locale: string): string {
  return items.filter(Boolean).join(locale === 'ar' ? '، ' : ', ');
}
