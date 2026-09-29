import type { Sport } from '@jordan-sports/contracts';
import { tileClass } from '@jordan-sports/ui';
import { Link } from '@/i18n/navigation';
import { pick } from '@/lib/localized';
import { Icon } from './icons';
import { Photo } from './photo';

/**
 * A sport tile linking to its venues: an illustrative photo with the name over it when the sport
 * has stock photos, otherwise the icon tile (the look without any stock photos downloaded).
 */
export function SportTile({ sport, locale }: { sport: Sport; locale: string }) {
  const href = { pathname: '/venues', query: { sport: sport.key } };
  const photo = sport.photos[0];
  if (photo) {
    return (
      <Link
        href={href}
        className="lift group relative flex h-28 flex-col justify-end overflow-hidden rounded-tile bg-night p-3 text-canvas"
      >
        <Photo
          photo={photo}
          alt=""
          sizes="(min-width: 640px) 170px, 33vw"
          className="zoom-media !absolute inset-0"
        />
        <span
          aria-hidden
          className="absolute inset-0 bg-gradient-to-t from-night/85 via-night/25 to-transparent"
        />
        <Icon name={sport.icon} className="relative size-5" strokeWidth={1.8} />
        <span className="relative mt-1 truncate text-sm font-semibold">
          {pick(sport.name, locale)}
        </span>
      </Link>
    );
  }
  return (
    <Link
      href={href}
      className={tileClass(
        false,
        'group h-28 hover:-translate-y-0.5 hover:border-primary hover:bg-primary hover:text-on-primary hover:shadow-lift',
      )}
    >
      <Icon
        name={sport.icon}
        className="size-7 transition-transform duration-base ease-spring group-hover:-rotate-6 group-hover:scale-110"
        strokeWidth={1.5}
      />
      <span className="truncate text-sm font-semibold">{pick(sport.name, locale)}</span>
    </Link>
  );
}
