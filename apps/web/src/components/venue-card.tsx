import type { VenueSummary } from '@jordan-sports/contracts';
import { Link } from '@/i18n/navigation';
import { joinList, pick } from '@/lib/localized';

export function VenueCard({ venue, locale }: { venue: VenueSummary; locale: string }) {
  const place = [
    venue.area ? pick(venue.area.name, locale) : null,
    pick(venue.city.name, locale),
  ].filter(Boolean) as string[];
  return (
    <Link
      href={`/venues/${venue.slug}`}
      className="group flex flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-sm hover:border-brand-300"
      data-testid="venue-card"
    >
      {venue.cover ? (
        // eslint-disable-next-line @next/next/no-img-element -- images are served by our API (already optimized WebP)
        <img
          src={`/api${venue.cover.url}`}
          alt=""
          width={venue.cover.width}
          height={venue.cover.height}
          loading="lazy"
          className="aspect-video w-full object-cover"
        />
      ) : (
        <div className="aspect-video w-full bg-brand-50" aria-hidden />
      )}
      <div className="flex flex-col gap-1 p-4">
        <h2 className="text-lg font-bold text-ink group-hover:text-brand-800">
          {pick(venue.name, locale)}
        </h2>
        <p className="text-sm text-ink-muted">{joinList(place, locale)}</p>
        <p className="text-sm text-brand-800">
          {joinList(
            venue.sports.map((s) => pick(s.name, locale)),
            locale,
          )}
        </p>
      </div>
    </Link>
  );
}
