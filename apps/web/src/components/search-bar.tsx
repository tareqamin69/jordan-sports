'use client';

import type { Catalog } from '@jordan-sports/contracts/web';
import { cx } from '@jordan-sports/ui';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useId, useState, type ReactNode } from 'react';
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

/** One "label over value" cell of the search card; the native select covers the whole cell. */
function Cell({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: (id: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div className={cx('relative h-[62px] min-w-0', className)}>
      <label
        htmlFor={id}
        className="pointer-events-none absolute inset-x-3 top-2.5 z-10 truncate text-[11px] leading-4 text-ink-muted"
      >
        {label}
      </label>
      {children(id)}
    </div>
  );
}

const select =
  'absolute inset-0 w-full cursor-pointer appearance-none truncate rounded-2xl bg-transparent px-3 pb-2.5 pt-[26px] text-sm font-semibold text-ink transition-colors duration-200 hover:bg-canvas/70 focus:bg-canvas focus:outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:text-ink-muted';

/**
 * Venue search: sport, governorate → area (Jordan-wide, no city hardcoded), day, time. A plain GET
 * form to `/venues`; the governorate→area cascade is the only client state. `floating` is the
 * white card that overlaps the home hero.
 */
export function SearchBar(props: Parameters<typeof SearchForm>[0]) {
  // A new query (e.g. a filter chip navigating client-side) starts a fresh form: the fields are
  // uncontrolled, so they would otherwise keep the previous values.
  const v = props.values ?? {};
  return <SearchForm key={[v.sport, v.governorate, v.area, v.date, v.time].join('|')} {...props} />;
}

function SearchForm({
  catalog,
  values = {},
  floating = false,
  className,
}: {
  catalog: Catalog;
  values?: SearchValues;
  floating?: boolean;
  className?: string;
}) {
  const t = useTranslations('web.search');
  const locale = useLocale();
  const format = useFormatter();
  const [governorateKey, setGovernorateKey] = useState(values.governorate ?? '');
  const governorate = catalog.governorates.find((g) => g.key === governorateKey);
  const areas = governorate?.areas ?? [];
  // Only sports with at least one approved venue, most venues first (searching the others finds
  // nothing; /sports invites owners to add them).
  const offeredSports = catalog.offeredSportIds.flatMap((id) =>
    catalog.sports.filter((s) => s.id === id),
  );
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
        'flex flex-col gap-1 rounded-[1.625rem] bg-surface p-2.5 ring-0 ring-primary/20 transition-[box-shadow] duration-base ease-soft focus-within:ring-4 lg:flex-row lg:items-center',
        floating ? 'shadow-float' : 'border border-line',
        className,
      )}
    >
      <div className="grid min-w-0 flex-1 grid-cols-3 lg:grid-cols-5">
        <Cell label={t('sport')}>
          {(id) => (
            <select id={id} name="sport" defaultValue={values.sport ?? ''} className={select}>
              <option value="">{t('anySport')}</option>
              {offeredSports.map((s) => (
                <option key={s.id} value={s.key}>
                  {pick(s.name, locale)}
                </option>
              ))}
            </select>
          )}
        </Cell>
        <Cell label={t('governorate')} className="border-s border-line">
          {(id) => (
            <select
              id={id}
              name="governorate"
              value={governorateKey}
              onChange={(e) => setGovernorateKey(e.target.value)}
              className={select}
            >
              <option value="">{t('anyGovernorate')}</option>
              {catalog.governorates.map((g) => (
                <option key={g.id} value={g.key}>
                  {pick(g.name, locale)}
                </option>
              ))}
            </select>
          )}
        </Cell>
        <Cell label={t('date')} className="border-s border-line">
          {(id) => (
            <select id={id} name="date" defaultValue={values.date ?? ''} className={select}>
              <option value="">{t('anyDate')}</option>
              {days.map((d, i) => (
                <option key={d} value={d}>
                  {dayLabel(d, i)}
                </option>
              ))}
            </select>
          )}
        </Cell>
        <Cell
          label={t('area')}
          className="col-span-2 border-t border-line lg:col-span-1 lg:border-s lg:border-t-0"
        >
          {(id) => (
            <select
              id={id}
              name="area"
              key={governorateKey}
              defaultValue={values.area ?? ''}
              disabled={!governorate}
              className={select}
            >
              <option value="">{t('anyArea')}</option>
              {areas.map((a) => (
                <option key={a.id} value={a.key}>
                  {pick(a.name, locale)}
                </option>
              ))}
            </select>
          )}
        </Cell>
        <Cell label={t('time')} className="border-s border-t border-line lg:border-t-0">
          {(id) => (
            <select id={id} name="time" defaultValue={values.time ?? ''} className={select}>
              <option value="">{t('anyTime')}</option>
              {TIMES.map((time) => (
                <option key={time} value={time}>
                  {time}
                </option>
              ))}
            </select>
          )}
        </Cell>
      </div>
      <button
        type="submit"
        className="group flex h-[54px] shrink-0 items-center justify-center gap-2.5 rounded-[1.125rem] bg-primary px-8 text-base font-semibold text-on-primary transition-[background-color,transform] duration-fast ease-soft hover:bg-primary-hover active:scale-[0.97]"
      >
        <Icon
          name="search"
          className="size-[19px] transition-transform duration-base ease-spring group-hover:scale-110 group-focus-visible:scale-110"
          strokeWidth={2.2}
        />
        {t('submit')}
      </button>
    </form>
  );
}
