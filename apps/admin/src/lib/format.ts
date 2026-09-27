/** Jordanian numeric date: DD/MM/YYYY (Western digits) from a YYYY-MM-DD calendar date. */
export function dmy(date: string): string {
  const [y, m, d] = date.split('-');
  return `${d}/${m}/${y}`;
}

/** "DD/MM/YYYY HH:mm" of an instant in Amman time. */
export function dmyTime(instant: Date, timeZone = 'Asia/Amman'): string {
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(instant);
  return `${dmy(date)} ${time}`;
}
