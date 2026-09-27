import { getCatalog, listVenues } from '@jordan-sports/contracts';
import type { Locale } from '@jordan-sports/i18n';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Icon } from '@/components/icons';
import { NearbyVenues } from '@/components/nearby-venues';
import { SearchBar } from '@/components/search-bar';
import { Link } from '@/i18n/navigation';
import { pick } from '@/lib/localized';
import { serverApi } from '@/lib/server-api';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ locale: Locale }> };

export default async function HomePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('web.home');
  const [catalog, venues] = await Promise.all([
    serverApi(getCatalog),
    serverApi(listVenues, { query: { limit: 6 } }),
  ]);
  // Players only see sports that at least one approved venue actually offers.
  const offeredSports = catalog.sports.filter((s) => catalog.offeredSportIds.includes(s.id));

  return (
    <main className="flex-1">
      <section className="bg-gradient-to-b from-brand-800 to-brand-700 px-4 pb-24 pt-10 text-white sm:pt-16">
        <div className="mx-auto max-w-5xl">
          <h1 className="text-3xl font-bold sm:text-5xl">{t('title')}</h1>
          <p className="mt-3 max-w-2xl text-lg text-white/85">{t('description')}</p>
        </div>
      </section>
      <div className="mx-auto -mt-16 w-full max-w-5xl px-4">
        <SearchBar catalog={catalog} />

        <section aria-labelledby="sports-heading" className="mt-8">
          <h2 id="sports-heading" className="text-xl font-bold">
            {t('sportsTitle')}
          </h2>
          <ul className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-4">
            {offeredSports.map((sport) => (
              <li key={sport.id}>
                <Link
                  href={{ pathname: '/venues', query: { sport: sport.key } }}
                  className="flex flex-col items-center gap-2 rounded-xl border border-line bg-surface p-4 text-center font-bold text-brand-900 shadow-sm hover:border-brand-300"
                >
                  <span className="grid size-12 place-items-center rounded-full bg-brand-50 text-brand-800">
                    <Icon name={sport.icon} className="size-7" />
                  </span>
                  {pick(sport.name, locale)}
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <NearbyVenues venues={venues.items} />

        <Link
          href="/venues"
          className="mb-12 mt-6 inline-block font-medium text-brand-800 underline"
        >
          {t('browseAll')}
        </Link>
      </div>
    </main>
  );
}
