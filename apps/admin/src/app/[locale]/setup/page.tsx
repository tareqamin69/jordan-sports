import type { Locale } from '@jordan-sports/i18n';
import { setRequestLocale } from 'next-intl/server';
import { use } from 'react';
import { AccountSetupForm } from '@/components/account-setup';

type Props = { params: Promise<{ locale: Locale }> };

export default function SetupPage({ params }: Props) {
  const { locale } = use(params);
  setRequestLocale(locale);
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-10 sm:px-8">
      <AccountSetupForm />
    </main>
  );
}
