'use client';

import type { VenueSummary } from '@jordan-sports/contracts';
import { formatMoney } from '@jordan-sports/money';
import { SectionHeading, cx } from '@jordan-sports/ui';
import { useLocale, useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
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
 * Featured venues as a swipeable, numbered photo carousel. "Near me" asks for the location once
 * and re-sorts in the browser only.
 */
export function VenuePicks({ venues }: { venues: VenueSummary[] }) {
  const t = useTranslations('web.home');
  const tv = useTranslations('web.venues');
  const locale = useLocale();
  const [here, setHere] = useState<{ lat: number; lng: number } | null>(null);
  const [state, setState] = useState<'idle' | 'locating' | 'denied'>('idle');
  const scroller = useRef<HTMLOListElement>(null);

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
  const meta = (v: VenueSummary, d: number | undefined) =>
    [venuePlace(v, locale), d !== undefined ? tv('distance', { km: d.toFixed(1) }) : '']
      .filter(Boolean)
      .join(' · ');

  // Swipe on touch; arrow buttons on wider screens. Scroll direction follows the page (RTL).
  const page = (step: 1 | -1) => {
    const el = scroller.current;
    if (!el) return;
    const rtl = getComputedStyle(el).direction === 'rtl';
    el.scrollBy({ left: step * (rtl ? -1 : 1) * el.clientWidth * 0.85, behavior: 'smooth' });
  };

  if (sorted.length === 0) return null;
  return (
    <section aria-labelledby="venues-heading" className="reveal mt-14">
      <SectionHeading
        id="venues-heading"
        eyebrow={here ? t('nearestTitle') : t('featuredTitle')}
        title={t('picksTitle')}
        action={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={locate}
              disabled={state === 'locating'}
              className="pressable flex h-11 items-center gap-1.5 rounded-full border border-line-strong px-3.5 text-[13px] font-medium text-ink transition-colors hover:bg-surface disabled:opacity-60"
            >
              <Icon name="pin" className="size-4" />
              {state === 'locating' ? t('locating') : t('nearMe')}
            </button>
            {sorted.length > 2 ? (
              <span className="hidden gap-1.5 sm:flex">
                <ArrowButton label={t('previous')} onClick={() => page(-1)} back />
                <ArrowButton label={t('next')} onClick={() => page(1)} />
              </span>
            ) : null}
          </div>
        }
      />
      {state === 'denied' ? (
        <p className="mt-2 text-sm text-ink-muted">{t('locationDenied')}</p>
      ) : null}

      <ol
        ref={scroller}
        className="no-scrollbar -mx-5 mt-5 flex snap-x snap-mandatory scroll-px-5 gap-4 overflow-x-auto px-5 pb-4 pt-1 sm:-mx-8 sm:scroll-px-8 sm:px-8"
      >
        {sorted.map(({ v, d }, i) => (
          <li
            key={v.id}
            className="w-[82%] shrink-0 snap-start sm:w-[calc(50%-0.5rem)] lg:w-[calc(33.333%-0.667rem)]"
          >
            <article className="lift group relative flex h-full flex-col overflow-hidden rounded-card border border-line bg-surface has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-focus">
              <div className="relative h-52 overflow-hidden bg-night sm:h-56">
                <VenuePhoto
                  venue={v}
                  className="zoom-media"
                  sizes="(min-width: 1024px) 380px, (min-width: 640px) 50vw, 82vw"
                />
                <span
                  aria-hidden
                  className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-night/55 to-transparent"
                />
                <span
                  aria-hidden
                  className="absolute start-4 top-3.5 font-display text-[2.5rem] leading-none text-canvas"
                >
                  {rank(i)}
                </span>
                <span className="absolute end-3.5 top-3.5 flex gap-1.5">
                  {v.sports.slice(0, 3).map((s) => (
                    <span
                      key={s.id}
                      title={pick(s.name, locale)}
                      className="grid size-8 place-items-center rounded-full bg-surface/95 text-ink"
                    >
                      <Icon name={s.icon} className="size-[18px]" />
                    </span>
                  ))}
                </span>
              </div>
              <div className="flex flex-1 items-start justify-between gap-4 px-5 pb-5 pt-4">
                <div className="flex min-w-0 flex-col gap-1">
                  <h3 className="truncate text-lg font-bold leading-snug">
                    <Link
                      href={`/venues/${v.slug}`}
                      className="after:absolute after:inset-0 focus-visible:outline-none"
                    >
                      {pick(v.name, locale)}
                    </Link>
                  </h3>
                  <p className="truncate text-[13px] text-ink-muted">{meta(v, d)}</p>
                  <p className="eyebrow truncate">
                    {joinList(
                      v.sports.map((s) => pick(s.name, locale)),
                      locale,
                    )}
                  </p>
                </div>
                {v.priceFrom ? (
                  <p className="flex shrink-0 flex-col items-end">
                    <span className="text-[11px] text-ink-muted">{tv('from')}</span>
                    <span className="text-lg font-bold leading-tight text-primary">
                      {formatMoney(v.priceFrom, locale)}
                    </span>
                  </p>
                ) : null}
              </div>
            </article>
          </li>
        ))}
      </ol>
    </section>
  );
}

function ArrowButton({
  label,
  onClick,
  back = false,
}: {
  label: string;
  onClick: () => void;
  back?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="pressable grid size-11 place-items-center rounded-full border border-line-strong text-ink transition-colors hover:bg-surface"
    >
      <Icon name="chevron" className={cx('size-5', back ? 'ltr:rotate-180' : 'rtl:rotate-180')} />
    </button>
  );
}
