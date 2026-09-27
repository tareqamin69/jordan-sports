import { useTranslations } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { use } from 'react';
import type { Locale } from '@jordan-sports/i18n';

type Props = { params: Promise<{ locale: Locale }> };

export default function HomePage({ params }: Props) {
  const { locale } = use(params);
  setRequestLocale(locale);
  const t = useTranslations('admin.home');

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-12 sm:py-20">
      <h1 className="text-3xl font-bold text-ink sm:text-4xl">{t('title')}</h1>
      <p
        role="status"
        className="mt-10 inline-block rounded-md border border-accent-500 bg-accent-300/40 px-4 py-2 text-sm text-ink"
      >
        {t('status')}
      </p>
    </main>
  );
}
