import { getCatalog, listVenues } from '@jordan-sports/contracts';
import type { Locale } from '@jordan-sports/i18n';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { VenueCard } from '@/components/venue-card';
import { pick } from '@/lib/localized';
import { serverApi } from '@/lib/server-api';

export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<{ sport?: string; area?: string }>;
};

const KEY = /^[a-z0-9_]{1,40}$/;

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
  const area = query.area && KEY.test(query.area) ? query.area : undefined;
  const t = await getTranslations('web.venues');
  const [catalog, venues] = await Promise.all([
    serverApi(getCatalog),
    serverApi(listVenues, {
      query: { limit: 60, city: 'amman', ...(sport ? { sport } : {}), ...(area ? { area } : {}) },
    }),
  ]);
  const sportName = catalog.sports.find((s) => s.key === sport)?.name;
  const areas = catalog.cities.find((c) => c.key === 'amman')?.areas ?? [];

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">
      <h1 className="text-3xl font-bold">
        {sportName ? t('titleForSport', { sport: pick(sportName, locale) }) : t('title')}
      </h1>
      <p className="mt-2 text-ink-muted">{t('description')}</p>

      <form
        method="get"
        className="mt-6 grid gap-3 rounded-lg border border-line bg-surface p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
      >
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          {t('filterSport')}
          <select
            name="sport"
            defaultValue={sport ?? ''}
            className="rounded-md border border-line bg-surface px-3 py-2.5 font-normal"
          >
            <option value="">{t('allSports')}</option>
            {catalog.sports.map((s) => (
              <option key={s.id} value={s.key}>
                {pick(s.name, locale)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          {t('filterArea')}
          <select
            name="area"
            defaultValue={area ?? ''}
            className="rounded-md border border-line bg-surface px-3 py-2.5 font-normal"
          >
            <option value="">{t('allAreas')}</option>
            {areas.map((a) => (
              <option key={a.id} value={a.key}>
                {pick(a.name, locale)}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="rounded-md bg-brand-700 px-4 py-2.5 font-medium text-white hover:bg-brand-800"
        >
          {t('apply')}
        </button>
      </form>

      {venues.items.length === 0 ? (
        <p className="mt-10 text-ink-muted">{t('empty')}</p>
      ) : (
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {venues.items.map((v) => (
            <li key={v.id}>
              <VenueCard venue={v} locale={locale} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
