/** Splits on the Arabic and Latin comma. */
const COMMA = /[،,]/;

const normalize = (segment: string) => segment.trim().replace(/\s+/g, ' ').toLocaleLowerCase();

/**
 * Joins address parts (street, area, governorate) into one line without repeating anything: a
 * venue's free-text address often already ends with the city, or repeats the area (QA #4).
 * Comma-separated segments are compared case-insensitively and kept in first-seen order.
 */
export function joinPlace(parts: ReadonlyArray<string | null | undefined>, locale: string): string {
  const seen = new Set<string>();
  const segments: string[] = [];
  for (const part of parts) {
    for (const raw of (part ?? '').split(COMMA)) {
      const key = normalize(raw);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      segments.push(raw.trim().replace(/\s+/g, ' '));
    }
  }
  return segments.join(locale === 'ar' ? '، ' : ', ');
}
