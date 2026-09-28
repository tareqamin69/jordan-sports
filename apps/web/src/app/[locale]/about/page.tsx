import type { Locale } from '@jordan-sports/i18n';
import { PageHeader } from '@jordan-sports/ui';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';

type Props = { params: Promise<{ locale: Locale }> };

// Absolute URLs (metadataBase, share links) use WEB_BASE_URL, which is only known at runtime: the
// deployment image is built without it, so these must not be pre-rendered at build time.
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'web.about' });
  const tc = await getTranslations({ locale, namespace: 'common' });
  return {
    title: t('title'),
    description: t('description', { appName: tc('appName') }),
    alternates: { canonical: `/${locale}/about`, languages: { ar: '/ar/about', en: '/en/about' } },
  };
}

export default async function AboutPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('web.about');
  const tc = await getTranslations('common');
  const appName = tc('appName');

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-5 pb-10 pt-8 sm:px-8 sm:pt-12">
      <PageHeader title={t('title')} description={t('description', { appName })} />
      <div className="flex flex-col gap-4 text-ink">
        <p>{t('body1', { appName })}</p>
        <p>{t('body2')}</p>
        <p>{t('body3')}</p>
      </div>
    </main>
  );
}
