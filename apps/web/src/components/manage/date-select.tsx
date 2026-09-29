'use client';

import { SelectField } from '@jordan-sports/ui';
import { useFormatter } from 'next-intl';
import { dmy } from '@/lib/format';
import { addDays, dateForLabel } from '@/lib/time';

/**
 * Day picker with Jordanian DD/MM/YYYY labels (native date inputs follow the phone's settings and
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
          {[format.dateTime(dateForLabel(d), { weekday: 'short' }), dmy(d)].join(' ')}
        </option>
      ))}
    </SelectField>
  );
}
