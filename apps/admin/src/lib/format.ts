/** Jordanian numeric date: DD/MM/YYYY (Western digits) from a YYYY-MM-DD calendar date. */
export function dmy(date: string): string {
  const [y, m, d] = date.split('-');
  return `${d}/${m}/${y}`;
}

/** "DD/MM/YYYY HH:mm" of an instant in Amman time. */
export function dmyTime(instant: Date, timeZone = 'Asia/Amman'): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    numberingSystem: 'latn',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const date = `${get('year')}-${get('month')}-${get('day')}`;
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(instant);
  return `${dmy(date)} ${time}`;
}
