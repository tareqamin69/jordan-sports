'use client';

import type { VenueSummary } from '@jordan-sports/contracts';
import { formatMoney } from '@jordan-sports/money';
import { SectionHeading, cx } from '@jordan-sports/ui';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Link } from '@/i18n/navigation';
import { joinList, pick } from '@/lib/localized';
import { Icon } from './icons';
import { venuePlace } from './venue-card';
import { VenuePhoto } from './venue-photo';

function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 12_742 * Math.asin(Math.sqrt(h));
}

const rank = (i: number) => String(i + 1).padStart(2, '0');

/**
 * Editorial venue picks: the first venue as a big photo card numbered "01", the rest as numbered
 * rows. "Near me" asks for the location once and re-sorts in the browser only.
 */
export function VenuePicks({ venues }: { venues: VenueSummary[] }) {
  const t = useTranslations('web.home');
  const tv = useTranslations('web.venues');
  const locale = useLocale();
  const [here, setHere] = useState<{ lat: number; lng: number } | null>(null);
  const [state, setState] = useState<'idle' | 'locating' | 'denied'>('idle');

  const locate = () => {
    if (!('geolocation' in navigator)) return setState('denied');
    setState('locating');
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setHere({ lat: p.coords.latitude, lng: p.coords.longitude });
        setState('idle');
      },
      () => setState('denied'),
      { timeout: 10_000, maximumAge: 300_000 },
    );
  };

  const sorted = here
    ? venues
        .map((v) => ({ v, d: v.location ? distanceKm(here, v.location) : undefined }))
        .sort((a, b) => (a.d ?? Infinity) - (b.d ?? Infinity))
    : venues.map((v) => ({ v, d: undefined }));
  const [first, ...rest] = sorted;
  const meta = (v: VenueSummary, d: number | undefined) =>
    [venuePlace(v, locale), d !== undefined ? tv('distance', { km: d.toFixed(1) }) : '']
      .filter(Boolean)
      .join(' · ');

  if (!first) return null;
  return (
    <section aria-labelledby="venues-heading" className="mt-14">
      <SectionHeading
        id="venues-heading"
        eyebrow={here ? t('nearestTitle') : t('featuredTitle')}
        title={t('picksTitle')}
        action={
          <button
            type="button"
            onClick={locate}
            disabled={state === 'locating'}
            className="flex h-9 items-center gap-1.5 rounded-full border border-line-strong px-3 text-[13px] font-medium text-ink transition-colors hover:bg-surface disabled:opacity-60"
          >
            <Icon name="pin" className="size-4" />
            {state === 'locating' ? t('locating') : t('nearMe')}
          </button>
        }
      />
      {state === 'denied' ? (
        <p className="mt-2 text-sm text-ink-muted">{t('locationDenied')}</p>
      ) : null}

      <div className="mt-5 grid gap-4 lg:grid-cols-[1.15fr_1fr] lg:gap-8">
        <article className="group relative self-start overflow-hidden rounded-card border border-line bg-surface transition-shadow duration-300 hover:shadow-lift has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-focus">
          <div className="relative h-[230px] overflow-hidden bg-night sm:h-72">
            <VenuePhoto
              venue={first.v}
              className="transition-transform duration-500 ease-soft group-hover:scale-[1.03]"
            />
            <span
              aria-hidden
              className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-night/55 to-transparent"
            />
            <span
              aria-hidden
              className="absolute start-4 top-4 font-display text-[2.75rem] leading-none text-canvas"
            >
              {rank(0)}
            </span>
          </div>
          <div className="flex flex-col gap-3 px-5 pb-5 pt-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 flex-col gap-1">
                <h3 className="text-lg font-bold leading-snug">
                  <Link
                    href={`/venues/${first.v.slug}`}
                    className="after:absolute after:inset-0 focus-visible:outline-none"
                  >
                    {pick(first.v.name, locale)}
                  </Link>
                </h3>
                <p className="text-[13px] text-ink-muted">{meta(first.v, first.d)}</p>
              </div>
              {first.v.priceFrom ? (
                <p className="flex shrink-0 flex-col items-end">
                  <span className="text-[11px] text-ink-muted">{tv('from')}</span>
                  <span className="text-lg font-bold leading-tight text-primary">
                    {formatMoney(first.v.priceFrom, locale)}
                  </span>
                </p>
              ) : null}
            </div>
            <ul className="flex flex-wrap gap-1.5">
              {first.v.sports.map((s) => (
                <li
                  key={s.id}
                  className="flex h-7 items-center rounded-full bg-canvas px-3 text-xs text-ink"
                >
                  {pick(s.name, locale)}
                </li>
              ))}
            </ul>
          </div>
        </article>

        {rest.length > 0 ? (
          <ol className="flex flex-col">
            {rest.map(({ v, d }, i) => (
              <li
                key={v.id}
                className={cx(
                  'group relative flex items-center gap-4 rounded-tile py-3.5 has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-focus',
                  i < rest.length - 1 && 'border-b border-line',
                )}
              >
                <span className="relative size-[76px] shrink-0 overflow-hidden rounded-[1.125rem] bg-night">
                  <VenuePhoto
                    venue={v}
                    variant="top"
                    className="transition-transform duration-500 ease-soft group-hover:scale-105"
                  />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="eyebrow truncate">
                    {[
                      rank(i + 1),
                      joinList(
                        v.sports.map((s) => pick(s.name, locale)),
                        locale,
                      ),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                  <Link
                    href={`/venues/${v.slug}`}
                    className="truncate text-base font-semibold text-ink after:absolute after:inset-0 group-hover:text-primary focus-visible:outline-none"
                  >
                    {pick(v.name, locale)}
                  </Link>
                  <span className="truncate text-xs text-ink-muted">
                    {[
                      meta(v, d),
                      v.priceFrom
                        ? tv('priceFrom', { price: formatMoney(v.priceFrom, locale) })
                        : '',
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
                <Icon
                  name="chevron"
                  className="size-5 shrink-0 text-ink-muted transition-transform duration-200 rtl:rotate-180 group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5"
                />
              </li>
            ))}
          </ol>
        ) : null}
      </div>
    </section>
  );
}
