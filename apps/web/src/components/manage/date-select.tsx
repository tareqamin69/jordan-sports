'use client';

import { SelectField } from '@jordan-sports/ui';
import { useFormatter } from 'next-intl';
import { addDays, dateForLabel } from '@/lib/time';

/**
 * Day picker with Jordanian day/month labels (native date inputs follow the phone's settings and
 * may show MM/DD). Offers `days` days from `from`; the current value is always included.
 */
export function DateSelect({
  label,
  value,
  onChange,
  from,
  days = 120,
  name,
}: {
  label: string;
  value: string;
  onChange: (date: string) => void;
  from: string;
  days?: number;
  name?: string;
}) {
  const format = useFormatter();
  const thisYear = String(new Date().getFullYear());
  const options = Array.from({ length: days }, (_, i) => addDays(from, i));
  // The current value is always an option (a select whose value matches nothing shows its first
  // entry, which would silently look like a different date).
  if (/^\d{4}-\d{2}-\d{2}$/.test(value) && !options.includes(value)) {
    options.push(value);
    options.sort();
  }
  return (
    <SelectField label={label} value={value} onChange={(e) => onChange(e.target.value)} name={name}>
      {options.map((d) => (
        <option key={d} value={d}>
          {[format.dateTime(dateForLabel(d), { weekday: 'short' }), shortDate(d, thisYear)].join(
            ' ',
          )}
        </option>
      ))}
    </SelectField>
  );
}

/** "1/10" (day/month), with the year only when it is not the current one: fits narrow selects. */
function shortDate(date: string, thisYear: string): string {
  const [y, m, d] = date.split('-');
  const dm = `${Number(d)}/${Number(m)}`;
  return y === thisYear ? dm : `${dm}/${y}`;
}
