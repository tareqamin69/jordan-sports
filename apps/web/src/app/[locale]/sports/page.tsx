import { getCatalog } from '@jordan-sports/contracts';
import type { Locale } from '@jordan-sports/i18n';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PageHeader } from '@jordan-sports/ui';
import { SportTile } from '@/components/sport-tile';
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
  // Every active sport, even one without venues yet (its page explains and invites venues).
  const offeredSports = catalog.sports;

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-5 pb-10 pt-8 sm:px-8 sm:pt-12">
      <PageHeader title={t('title')} description={t('description')} />

      <ul className="reveal-stagger grid grid-cols-3 gap-2.5 sm:grid-cols-4 sm:gap-3 lg:grid-cols-6">
        {offeredSports.map((sport) => (
          <li key={sport.id}>
            <SportTile sport={sport} locale={locale} />
          </li>
        ))}
      </ul>
    </main>
  );
}
