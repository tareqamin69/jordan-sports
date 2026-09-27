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
  if (value && !options.includes(value)) options.unshift(value);
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
