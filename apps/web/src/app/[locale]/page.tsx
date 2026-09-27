import { getCatalog } from '@jordan-sports/contracts';
import type { Locale } from '@jordan-sports/i18n';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { pick } from '@/lib/localized';
import { serverApi } from '@/lib/server-api';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ locale: Locale }> };

export default async function HomePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('web');
  const catalog = await serverApi(getCatalog);

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-12 sm:py-20">
      <h1 className="text-3xl font-bold text-ink sm:text-5xl">{t('home.title')}</h1>
      <p className="mt-5 max-w-2xl text-lg text-ink-muted">{t('home.description')}</p>
      <p
        role="status"
        className="mt-8 inline-block rounded-md border border-accent-500 bg-accent-300/40 px-4 py-2 text-sm text-ink"
      >
        {t('home.status')}
      </p>
      <section className="mt-12" aria-labelledby="sports-heading">
        <h2 id="sports-heading" className="text-xl font-bold">
          {t('venues.sportsTitle')}
        </h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-3">
          {catalog.sports.map((sport) => (
            <li key={sport.id}>
              <Link
                href={{ pathname: '/venues', query: { sport: sport.key } }}
                className="block rounded-lg border border-line bg-surface p-5 text-lg font-bold text-brand-800 shadow-sm hover:border-brand-300"
              >
                {pick(sport.name, locale)}
              </Link>
            </li>
          ))}
        </ul>
        <Link href="/venues" className="mt-6 inline-block font-medium text-brand-800 underline">
          {t('venues.browse')}
        </Link>
      </section>
    </main>
  );
}
