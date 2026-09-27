import { getCatalog } from '@jordan-sports/contracts';
import type { Locale } from '@jordan-sports/i18n';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Icon } from '@/components/icons';
import { Link } from '@/i18n/navigation';
import { pick } from '@/lib/localized';
import { serverApi } from '@/lib/server-api';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ locale: Locale }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'web.sports' });
  return {
    title: t('title'),
    description: t('description'),
    alternates: { canonical: `/${locale}/sports`, languages: { ar: '/ar/sports', en: '/en/sports' } },
  };
}

export default async function SportsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('web.sports');
  const catalog = await serverApi(getCatalog);
  // Only sports with at least one approved venue — same rule as everywhere else in the app.
  const offeredSports = catalog.sports.filter((s) => catalog.offeredSportIds.includes(s.id));

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
      <h1 className="text-2xl font-bold sm:text-3xl">{t('title')}</h1>
      <p className="mt-1 text-ink-muted">{t('description')}</p>

      <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {offeredSports.map((sport) => (
          <li key={sport.id}>
            <Link
              href={{ pathname: '/venues', query: { sport: sport.key } }}
              className="flex flex-col items-center gap-2 rounded-xl border border-line bg-surface p-5 text-center font-bold text-brand-900 shadow-sm hover:border-brand-300"
            >
              <span className="grid size-14 place-items-center rounded-full bg-brand-50 text-brand-800">
                <Icon name={sport.icon} className="size-8" />
              </span>
              {pick(sport.name, locale)}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
