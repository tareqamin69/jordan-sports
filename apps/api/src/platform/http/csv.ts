/** Quotes a CSV field (RFC 4180) and defuses spreadsheet formulas. */
export function csvField(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number' || typeof value === 'bigint' || typeof value === 'boolean') {
    return String(value);
  }
  let s = typeof value === 'string' ? value : JSON.stringify(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: unknown[][]): string {
  // BOM so spreadsheet apps read Arabic text as UTF-8.
  return `\uFEFF${[header, ...rows].map((r) => r.map(csvField).join(',')).join('\r\n')}\r\n`;
}
