import { getCatalog, listVenues } from '@jordan-sports/contracts';
import type { Locale } from '@jordan-sports/i18n';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { EmptyState, PageHeader, buttonClass, chipClass } from '@jordan-sports/ui';
import { Icon } from '@/components/icons';
import { SearchBar } from '@/components/search-bar';
import { VenueCard } from '@/components/venue-card';
import { Link } from '@/i18n/navigation';
import { pick } from '@/lib/localized';
import { serverApi } from '@/lib/server-api';

export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<{
    sport?: string;
    governorate?: string;
    area?: string;
    date?: string;
    time?: string;
  }>;
};

const KEY = /^[a-z0-9_]{1,40}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'web.venues' });
  return {
    title: t('title'),
    description: t('description'),
    alternates: {
      canonical: `/${locale}/venues`,
      languages: { ar: '/ar/venues', en: '/en/venues' },
    },
  };
}

export default async function VenuesPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const query = await searchParams;
  const sport = query.sport && KEY.test(query.sport) ? query.sport : undefined;
  const governorate =
    query.governorate && KEY.test(query.governorate) ? query.governorate : undefined;
  const area = query.area && KEY.test(query.area) ? query.area : undefined;
  const date = query.date && DATE.test(query.date) ? query.date : undefined;
  const time = date && query.time && TIME.test(query.time) ? query.time : undefined;
  const t = await getTranslations('web.venues');
  const [catalog, venues] = await Promise.all([
    serverApi(getCatalog),
    serverApi(listVenues, {
      query: {
        limit: 60,
        ...(governorate ? { governorate } : {}),
        ...(sport ? { sport } : {}),
        ...(area ? { area } : {}),
        ...(date ? { date } : {}),
        ...(time ? { time } : {}),
      },
    }),
  ]);
  const sportName = catalog.sports.find((s) => s.key === sport)?.name;

  const offeredSports = catalog.sports;
  const sportHasVenues = sport
    ? catalog.offeredSportIds.includes(catalog.sports.find((x) => x.key === sport)?.id ?? '')
    : true;
  const keep = {
    ...(governorate ? { governorate } : {}),
    ...(area ? { area } : {}),
    ...(date ? { date } : {}),
    ...(time ? { time } : {}),
  };

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-5 pb-10 pt-8 sm:px-8 sm:pt-12">
      <PageHeader
        eyebrow={t('count', { count: venues.items.length, n: String(venues.items.length) })}
        title={sportName ? t('titleForSport', { sport: pick(sportName, locale) }) : t('title')}
        description={date ? t('searchDescription') : t('description')}
      />

      <SearchBar
        catalog={catalog}
        values={{ sport, governorate, area, date, time }}
        className="-mt-2"
      />

      <nav aria-label={t('filterSport')} className="-mx-5 mt-4 sm:mx-0">
        <ul className="no-scrollbar flex gap-2 overflow-x-auto px-5 pb-1 sm:flex-wrap sm:px-0">
          <li className="shrink-0">
            <Link
              href={{ pathname: '/venues', query: keep }}
              aria-current={!sport ? 'page' : undefined}
              className={chipClass(!sport)}
            >
              {t('allSports')}
            </Link>
          </li>
          {offeredSports.map((s) => (
            <li key={s.id} className="shrink-0">
              <Link
                href={{ pathname: '/venues', query: { ...keep, sport: s.key } }}
                aria-current={s.key === sport ? 'page' : undefined}
                className={chipClass(s.key === sport)}
              >
                <Icon name={s.icon} className="size-4" />
                {pick(s.name, locale)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {venues.items.length === 0 ? (
        <EmptyState
          className="mt-8"
          testId="venues-empty"
          art={sport && !sportHasVenues ? 'venues' : 'search'}
          title={sport && !sportHasVenues ? t('emptySport') : date ? t('emptySearch') : t('empty')}
          action={
            sport && !sportHasVenues ? (
              <Link href="/manage/register" className={buttonClass({ size: 'sm' })}>
                {t('emptySportCta')}
              </Link>
            ) : null
          }
        />
      ) : (
        <ul className="reveal-stagger mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {venues.items.map((v) => (
            <li key={v.id}>
              <VenueCard venue={v} locale={locale} date={date} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
