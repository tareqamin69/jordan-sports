import { getCatalog, getImageCredits } from '@jordan-sports/contracts';
import type { Locale } from '@jordan-sports/i18n';
import { PageHeader } from '@jordan-sports/ui';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Photo } from '@/components/photo';
import { pick } from '@/lib/localized';
import { serverApi } from '@/lib/server-api';

type Props = { params: Promise<{ locale: Locale }> };

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'web.credits' });
  return {
    title: t('title'),
    robots: { index: false },
    alternates: {
      canonical: `/${locale}/credits`,
      languages: { ar: '/ar/credits', en: '/en/credits' },
    },
  };
}

/** Credits for the self-hosted illustrative sport photos (Pexels License; docs/image-credits.md). */
export default async function CreditsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('web.credits');
  const [credits, catalog] = await Promise.all([serverApi(getImageCredits), serverApi(getCatalog)]);
  const photos = new Map(catalog.sports.flatMap((s) => s.photos.map((p) => [p.id, p] as const)));
  const sportName = (key: string) =>
    pick(catalog.sports.find((s) => s.key === key)?.name, locale) || key;

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-5 pb-10 pt-8 sm:px-8 sm:pt-12">
      <PageHeader title={t('title')} description={t('description')} />
      {credits.items.length === 0 ? (
        <p className="mt-8 text-ink-muted">{t('empty')}</p>
      ) : (
        <ul className="reveal-stagger mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
          {credits.items.map((c) => {
            const photo = photos.get(c.id);
            return (
              <li key={c.id} className="overflow-hidden rounded-tile border border-line bg-surface">
                <div className="h-32 bg-canvas-deep">
                  {photo ? (
                    <Photo photo={photo} alt="" sizes="(min-width: 640px) 280px, 50vw" />
                  ) : null}
                </div>
                <div className="flex flex-col gap-1 p-3 text-sm">
                  <span className="eyebrow">{sportName(c.sport)}</span>
                  <a
                    href={c.photographerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-ink hover:underline"
                  >
                    {t('by', { name: c.photographer })}
                  </a>
                  <a
                    href={c.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    {t('source')}
                  </a>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
