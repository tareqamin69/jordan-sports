import type { Locale } from '@jordan-sports/i18n';
import { setRequestLocale } from 'next-intl/server';
import { use } from 'react';
import { ManageHome } from '@/components/manage/manage-home';

export const metadata = { robots: { index: false } };

export default function ManagePage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = use(params);
  setRequestLocale(locale);
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
      <ManageHome />
    </main>
  );
}
