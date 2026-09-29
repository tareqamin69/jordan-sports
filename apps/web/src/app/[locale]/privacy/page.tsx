import type { Locale } from '@jordan-sports/i18n';
import { PageHeader } from '@jordan-sports/ui';
import type { Metadata } from 'next';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';

type Props = { params: Promise<{ locale: Locale }> };

/** Placeholder legal text was drafted this date — bump it whenever the copy actually changes. */
const DRAFTED_AT = new Date('2026-09-28');

// Absolute URLs (metadataBase, share links) use WEB_BASE_URL, which is only known at runtime: the
// deployment image is built without it, so these must not be pre-rendered at build time.
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'web.privacy' });
  const tc = await getTranslations({ locale, namespace: 'common' });
  return {
    title: t('title'),
    description: t('description', { appName: tc('appName') }),
    robots: { index: false },
    alternates: {
      canonical: `/${locale}/privacy`,
      languages: { ar: '/ar/privacy', en: '/en/privacy' },
    },
  };
}

export default async function PrivacyPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('web.privacy');
  const tl = await getTranslations('web.legal');
  const tc = await getTranslations('common');
  const format = await getFormatter();
  const appName = tc('appName');

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-5 pb-10 pt-8 sm:px-8 sm:pt-12">
      <PageHeader title={t('title')} description={t('description', { appName })} />
      <p className="text-ink">{t('body', { appName })}</p>
      <p className="mt-6 text-sm text-ink-muted">
        {tl('lastUpdated', { date: format.dateTime(DRAFTED_AT, { dateStyle: 'long' }) })}
      </p>
    </main>
  );
}
