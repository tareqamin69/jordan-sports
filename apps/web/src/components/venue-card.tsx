import type { VenueSummary } from '@jordan-sports/contracts';
import { formatMoney } from '@jordan-sports/money';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { joinPlace, pick } from '@/lib/localized';
import { Icon } from './icons';
import { VenuePhoto } from './venue-photo';

export function venuePlace(venue: VenueSummary, locale: string): string {
  return joinPlace(
    [venue.area ? pick(venue.area.name, locale) : '', pick(venue.governorate.name, locale)],
    locale,
  );
}

/** Photo-first card: big photo, name, place, sports, "from" price, and free times when searching. */
export function VenueCard({
  venue,
  locale,
  date,
  distanceKm,
}: {
  venue: VenueSummary;
  locale: string;
  date?: string | undefined;
  distanceKm?: number | undefined;
}) {
  const t = useTranslations('web.venues');
  const href = `/venues/${venue.slug}`;
  return (
    <article
      className="lift group relative flex h-full flex-col overflow-hidden rounded-card border border-line bg-surface has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-focus"
      data-testid="venue-card"
    >
      <div className="relative h-56 overflow-hidden bg-night">
        <VenuePhoto
          venue={venue}
          className="zoom-media"
          sizes="(min-width: 1024px) 380px, (min-width: 640px) 50vw, 100vw"
        />
        <span className="absolute end-4 top-4 flex gap-1.5">
          {venue.sports.map((s) => (
            <span
              key={s.id}
              title={pick(s.name, locale)}
              className="grid size-9 place-items-center rounded-full bg-surface/95 text-ink"
            >
              <Icon name={s.icon} className="size-5" />
            </span>
          ))}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1">
            <h2 className="text-lg font-bold leading-snug text-ink">
              <Link href={href} className="after:absolute after:inset-0 focus-visible:outline-none">
                {pick(venue.name, locale)}
              </Link>
            </h2>
            <p className="text-[13px] text-ink-muted">
              {venuePlace(venue, locale)}
              {distanceKm !== undefined ? (
                <span> · {t('distance', { km: distanceKm.toFixed(1) })}</span>
              ) : null}
            </p>
          </div>
          {venue.priceFrom ? (
            <p className="flex shrink-0 flex-col items-end text-end">
              <span className="text-[11px] text-ink-muted">{t('from')}</span>
              <span className="text-lg font-bold leading-tight text-primary">
                {formatMoney(venue.priceFrom, locale)}
              </span>
            </p>
          ) : null}
        </div>
        <ul className="flex flex-wrap gap-1.5">
          {venue.sports.map((s) => (
            <li
              key={s.id}
              className="flex h-7 items-center rounded-full bg-canvas px-3 text-xs text-ink"
            >
              {pick(s.name, locale)}
            </li>
          ))}
        </ul>
        {venue.freeTimes && venue.freeTimes.length > 0 ? (
          <ul className="relative z-10 mt-1 flex flex-wrap gap-2">
            {venue.freeTimes.map((f) => (
              <li key={f.start}>
                <Link
                  href={{ pathname: href, query: { date, time: f.localStart } }}
                  className="pressable flex h-11 items-center rounded-full border border-primary/30 bg-brand-50 px-4 text-sm font-semibold text-primary transition-colors hover:bg-primary hover:text-on-primary"
                  dir="ltr"
                >
                  {f.localStart}
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </article>
  );
}
