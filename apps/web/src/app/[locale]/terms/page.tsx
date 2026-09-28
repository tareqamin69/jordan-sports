import type { Locale } from '@jordan-sports/i18n';
import { Alert, PageHeader } from '@jordan-sports/ui';
import type { Metadata } from 'next';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';

type Props = { params: Promise<{ locale: Locale }> };

/** Placeholder legal text was drafted this date — bump it whenever the copy actually changes. */
const DRAFTED_AT = new Date('2026-09-28');

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'web.terms' });
  const tc = await getTranslations({ locale, namespace: 'common' });
  return {
    title: t('title'),
    description: t('description', { appName: tc('appName') }),
    robots: { index: false },
    alternates: { canonical: `/${locale}/terms`, languages: { ar: '/ar/terms', en: '/en/terms' } },
  };
}

export default async function TermsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('web.terms');
  const tl = await getTranslations('web.legal');
  const tc = await getTranslations('common');
  const format = await getFormatter();
  const appName = tc('appName');

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-5 pb-10 pt-8 sm:px-8 sm:pt-12">
      <PageHeader title={t('title')} description={t('description', { appName })} />
      <Alert tone="warning" className="mb-6">
        {tl('placeholderNotice')}
      </Alert>
      <p className="text-ink">{t('body', { appName })}</p>
      <p className="mt-6 text-sm text-ink-muted">
        {tl('lastUpdated', { date: format.dateTime(DRAFTED_AT, { dateStyle: 'long' }) })}
      </p>
    </main>
  );
}
