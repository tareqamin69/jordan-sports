import { getCatalog, listVenues } from '@jordan-sports/contracts';
import type { Locale } from '@jordan-sports/i18n';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { SearchBar } from '@/components/search-bar';
import { VenueCard } from '@/components/venue-card';
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

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
      <h1 className="text-2xl font-bold sm:text-3xl">
        {sportName ? t('titleForSport', { sport: pick(sportName, locale) }) : t('title')}
      </h1>
      <p className="mt-1 text-ink-muted">{date ? t('searchDescription') : t('description')}</p>

      <SearchBar catalog={catalog} values={{ sport, governorate, area, date, time }} className="mt-5" />

      {venues.items.length === 0 ? (
        <p className="mt-10 text-ink-muted">{date ? t('emptySearch') : t('empty')}</p>
      ) : (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
