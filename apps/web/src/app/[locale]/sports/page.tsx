import { getCatalog } from '@jordan-sports/contracts';
import type { Locale } from '@jordan-sports/i18n';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PageHeader, tileClass } from '@jordan-sports/ui';
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
    alternates: {
      canonical: `/${locale}/sports`,
      languages: { ar: '/ar/sports', en: '/en/sports' },
    },
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
    <main className="mx-auto w-full max-w-6xl flex-1 px-5 pb-10 pt-8 sm:px-8 sm:pt-12">
      <PageHeader title={t('title')} description={t('description')} />

      <ul className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 sm:gap-3 lg:grid-cols-6">
        {offeredSports.map((sport) => (
          <li key={sport.id} className="animate-rise">
            <Link
              href={{ pathname: '/venues', query: { sport: sport.key } }}
              className={tileClass(
                false,
                'h-28 hover:border-primary hover:bg-primary hover:text-on-primary',
              )}
            >
              <Icon name={sport.icon} className="size-7" strokeWidth={1.5} />
              <span className="text-sm font-semibold leading-5">{pick(sport.name, locale)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
