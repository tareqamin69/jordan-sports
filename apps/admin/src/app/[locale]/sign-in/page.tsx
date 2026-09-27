import type { Locale } from '@jordan-sports/i18n';
import { setRequestLocale } from 'next-intl/server';
import { use } from 'react';
import { AdminSignIn } from '@/components/admin-sign-in';

type Props = { params: Promise<{ locale: Locale }> };

export default function SignInPage({ params }: Props) {
  const { locale } = use(params);
  setRequestLocale(locale);
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">
      <AdminSignIn />
    </main>
  );
}
