import type { Locale } from '@jordan-sports/i18n';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { use } from 'react';
import { VenueDashboard } from '@/components/manage/venue-dashboard';
import { tabs, type Tab } from '@/lib/manage-tabs';

export const metadata = { robots: { index: false } };

type Props = {
  params: Promise<{ locale: Locale; venueId: string }>;
  searchParams: Promise<{ tab?: string }>;
};

export default function VenueDashboardPage({ params, searchParams }: Props) {
  const { locale, venueId } = use(params);
  const { tab } = use(searchParams);
  setRequestLocale(locale);
  if (!/^[0-9a-f-]{36}$/.test(venueId)) notFound();
  const current: Tab = (tabs as readonly string[]).includes(tab ?? '') ? (tab as Tab) : 'today';
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-5 pb-10 pt-8 sm:px-8 sm:pt-12">
      <VenueDashboard venueId={venueId} tab={current} />
    </main>
  );
}
