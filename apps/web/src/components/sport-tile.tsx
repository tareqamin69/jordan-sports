import type { Sport } from '@jordan-sports/contracts/web';
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
        'group h-32 hover:-translate-y-0.5 hover:border-primary hover:bg-primary hover:text-on-primary hover:shadow-lift',
      )}
    >
      <span className="grid size-11 place-items-center rounded-full bg-surface text-primary transition-colors group-hover:bg-on-primary/15 group-hover:text-on-primary">
        <Icon
          name={sport.icon}
          className="size-6 transition-transform duration-base ease-spring group-hover:-rotate-6 group-hover:scale-110"
          strokeWidth={1.6}
        />
      </span>
      <span className="line-clamp-2 text-sm font-semibold leading-snug">
        {pick(sport.name, locale)}
      </span>
    </Link>
  );
}
