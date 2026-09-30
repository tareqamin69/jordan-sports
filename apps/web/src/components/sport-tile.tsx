import type { Sport } from '@jordan-sports/contracts';
import { tileClass } from '@jordan-sports/ui';
import { Link } from '@/i18n/navigation';
import { pick } from '@/lib/localized';
import { Icon } from './icons';

/** A sport tile linking to its venues (home and /sports). */
export function SportTile({ sport, locale }: { sport: Sport; locale: string }) {
  return (
    <Link
      href={{ pathname: '/venues', query: { sport: sport.key } }}
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
