import type { VenueSummary } from '@jordan-sports/contracts';
import { formatMoney } from '@jordan-sports/money';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { joinList, pick } from '@/lib/localized';
import { Icon } from './icons';

/** Photo card: name, area, sports, "from" price, and free times when searching by date. */
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
  const place = [
    venue.area ? pick(venue.area.name, locale) : null,
    pick(venue.governorate.name, locale),
  ].filter(Boolean) as string[];
  return (
    <article
      className="group relative flex h-full flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-sm hover:border-brand-300"
      data-testid="venue-card"
    >
      <div className="relative">
        {venue.cover ? (
          // eslint-disable-next-line @next/next/no-img-element -- images are served by our API (already optimized WebP)
          <img
            src={`/api${venue.cover.url}`}
            alt=""
            width={venue.cover.width}
            height={venue.cover.height}
            loading="lazy"
            className="aspect-[16/10] w-full object-cover"
          />
        ) : (
          <div className="aspect-[16/10] w-full bg-brand-50" aria-hidden />
        )}
        {venue.priceFrom ? (
          <span className="absolute bottom-2 start-2 rounded-full bg-surface/95 px-3 py-1 text-sm font-bold text-brand-900 shadow">
            {t('priceFrom', { price: formatMoney(venue.priceFrom, locale) })}
          </span>
        ) : null}
        <span className="absolute end-2 top-2 flex gap-1">
          {venue.sports.map((s) => (
            <span
              key={s.id}
              title={pick(s.name, locale)}
              className="grid size-8 place-items-center rounded-full bg-surface/95 text-brand-800 shadow"
            >
              <Icon name={s.icon} className="size-5" />
            </span>
          ))}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-1 p-4">
        <h2 className="text-lg font-bold text-ink">
          <Link href={href} className="after:absolute after:inset-0 group-hover:text-brand-800">
            {pick(venue.name, locale)}
          </Link>
        </h2>
        <p className="flex items-center gap-1 text-sm text-ink-muted">
          <Icon name="pin" className="size-4 shrink-0" />
          {joinList(place, locale)}
          {distanceKm !== undefined ? (
            <span className="ms-1">· {t('distance', { km: distanceKm.toFixed(1) })}</span>
          ) : null}
        </p>
        <p className="text-sm text-brand-800">
          {joinList(
            venue.sports.map((s) => pick(s.name, locale)),
            locale,
          )}
        </p>
        {venue.freeTimes && venue.freeTimes.length > 0 ? (
          <ul className="relative z-10 mt-2 flex flex-wrap gap-2">
            {venue.freeTimes.map((f) => (
              <li key={f.start}>
                <Link
                  href={{ pathname: href, query: { date, time: f.localStart } }}
                  className="block rounded-md border border-brand-300 bg-brand-50 px-2.5 py-1 text-sm font-medium text-brand-900 hover:bg-brand-100"
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
