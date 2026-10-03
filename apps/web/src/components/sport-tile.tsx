import type { Sport } from '@jordan-sports/contracts/web';
import { cx, tileClass } from '@jordan-sports/ui';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { pick } from '@/lib/localized';
import { Icon } from './icons';

/**
 * A sport tile. With venues it links to them and says how many; without any (only on /sports) it
 * is muted and invites owners to register the first one.
 */
export function SportTile({
  sport,
  locale,
  venues,
}: {
  sport: Sport;
  locale: string;
  /** Approved venues offering it; 0 shows the muted "register yours" tile. */
  venues?: number;
}) {
  const t = useTranslations('web.sports');
  const name = pick(sport.name, locale);
  if (venues === 0) {
    return (
      <Link
        href="/manage/register"
        className={cx(
          tileClass(
            false,
            'group h-32 border-dashed border-line-strong bg-transparent text-ink-muted hover:bg-sand-100',
          ),
        )}
        data-testid="sport-tile-empty"
      >
        <span className="grid size-11 place-items-center rounded-full bg-sand-100 text-ink-muted">
          <Icon name={sport.icon} className="size-6" strokeWidth={1.6} />
        </span>
        <span className="line-clamp-2 text-xs leading-snug">
          {t('registerFirst', { sport: name })}
        </span>
      </Link>
    );
  }
  return (
    <Link
      href={{ pathname: '/venues', query: { sport: sport.key } }}
      className={tileClass(
        false,
        'group h-32 hover:-translate-y-0.5 hover:border-primary hover:bg-primary hover:text-on-primary hover:shadow-lift',
      )}
      data-testid="sport-tile"
    >
      <span className="grid size-11 place-items-center rounded-full bg-surface text-primary transition-colors group-hover:bg-on-primary/15 group-hover:text-on-primary">
        <Icon
          name={sport.icon}
          className="size-6 transition-transform duration-base ease-spring group-hover:-rotate-6 group-hover:scale-110"
          strokeWidth={1.6}
        />
      </span>
      <span className="flex flex-col">
        <span className="line-clamp-2 text-sm font-semibold leading-snug">{name}</span>
        {venues !== undefined ? (
          <span className="text-xs opacity-75">{t('venueCount', { count: venues })}</span>
        ) : null}
      </span>
    </Link>
  );
}
