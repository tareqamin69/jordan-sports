'use client';

import type { Catalog } from '@jordan-sports/contracts';
import { cx } from '@jordan-sports/ui';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { dmy } from '@/lib/format';
import { pick } from '@/lib/localized';
import { addDays, businessToday, dateForLabel } from '@/lib/time';
import { Icon } from './icons';

export interface SearchValues {
  sport?: string | undefined;
  governorate?: string | undefined;
  area?: string | undefined;
  date?: string | undefined;
  time?: string | undefined;
}

const TIMES = Array.from({ length: 16 }, (_, i) => `${String(8 + i).padStart(2, '0')}:00`);
const field =
  'w-full rounded-md border border-line bg-surface px-3 py-2.5 text-ink focus:border-brand-600 focus:outline-none';

/**
 * Venue search: sport, governorate → area (Jordan-wide, no city hardcoded), day, time. A plain GET
 * form to `/venues`; the governorate→area cascade is the only client state.
 */
export function SearchBar({
  catalog,
  values = {},
  className,
}: {
  catalog: Catalog;
  values?: SearchValues;
  className?: string;
}) {
  const t = useTranslations('web.search');
  const locale = useLocale();
  const format = useFormatter();
  const [governorateKey, setGovernorateKey] = useState(values.governorate ?? '');
  const governorate = catalog.governorates.find((g) => g.key === governorateKey);
  const areas = governorate?.areas ?? [];
  // Players only choose from sports that at least one approved venue actually offers.
  const offeredSports = catalog.sports.filter((s) => catalog.offeredSportIds.includes(s.id));
  const today = businessToday('Asia/Amman', 360);
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i));
  const dayLabel = (d: string, i: number) =>
    i === 0
      ? t('today')
      : i === 1
        ? t('tomorrow')
        : `${format.dateTime(dateForLabel(d), { weekday: 'long' })} ${dmy(d).slice(0, 5)}`;

  return (
    <form
      method="get"
      action={`/${locale}/venues`}
      role="search"
      className={cx(
        'grid grid-cols-2 gap-3 rounded-xl border border-line bg-surface p-4 shadow-md sm:grid-cols-3 lg:grid-cols-[1fr_1fr_1fr_1fr_1fr_auto] lg:items-end',
        className,
      )}
    >
      <label className="flex flex-col gap-1 text-sm font-medium">
        {t('sport')}
        <select name="sport" defaultValue={values.sport ?? ''} className={field}>
          <option value="">{t('anySport')}</option>
          {offeredSports.map((s) => (
            <option key={s.id} value={s.key}>
              {pick(s.name, locale)}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        {t('governorate')}
        <select
          name="governorate"
          value={governorateKey}
          onChange={(e) => setGovernorateKey(e.target.value)}
          className={field}
        >
          <option value="">{t('anyGovernorate')}</option>
          {catalog.governorates.map((g) => (
            <option key={g.id} value={g.key}>
              {pick(g.name, locale)}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        {t('area')}
        <select
          name="area"
          key={governorateKey}
          defaultValue={values.area ?? ''}
          disabled={!governorate}
          className={cx(field, !governorate && 'opacity-60')}
        >
          <option value="">{t('anyArea')}</option>
          {areas.map((a) => (
            <option key={a.id} value={a.key}>
              {pick(a.name, locale)}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        {t('date')}
        <select name="date" defaultValue={values.date ?? ''} className={field}>
          <option value="">{t('anyDate')}</option>
          {days.map((d, i) => (
            <option key={d} value={d}>
              {dayLabel(d, i)}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        {t('time')}
        <select name="time" defaultValue={values.time ?? ''} className={field}>
          <option value="">{t('anyTime')}</option>
          {TIMES.map((time) => (
            <option key={time} value={time}>
              {time}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        className="col-span-2 flex min-h-11 items-center justify-center gap-2 rounded-md bg-brand-700 px-5 py-2.5 font-bold text-white hover:bg-brand-800 sm:col-span-3 lg:col-span-1"
      >
        <Icon name="search" />
        {t('submit')}
      </button>
    </form>
  );
}
