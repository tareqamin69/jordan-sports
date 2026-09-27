import type { Locale } from '@jordan-sports/i18n';
import { setRequestLocale } from 'next-intl/server';
import { use } from 'react';
import { AccountView } from '@/components/account-view';

type Props = { params: Promise<{ locale: Locale }> };

export const metadata = { robots: { index: false } };

export default function AccountPage({ params }: Props) {
  const { locale } = use(params);
  setRequestLocale(locale);
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-5 pb-10 pt-8 sm:px-8 sm:pt-12">
      <AccountView />
    </main>
  );
}
