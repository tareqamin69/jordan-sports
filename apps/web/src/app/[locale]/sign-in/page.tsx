import type { Locale } from '@jordan-sports/i18n';
import { setRequestLocale } from 'next-intl/server';
import { use } from 'react';
import { SignInFlow } from '@/components/sign-in-flow';

type Props = {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<{ next?: string | string[] }>;
};

export const metadata = { robots: { index: false } };

export default function SignInPage({ params, searchParams }: Props) {
  const { locale } = use(params);
  const { next } = use(searchParams);
  setRequestLocale(locale);
  // The sign-in code is shown on screen only with the console channel, and in a production build
  // only on staging (STAGING=true) — the same rule as the API's dev-only code endpoint.
  const devNotice =
    (process.env.OTP_CHANNEL ?? 'console') === 'console' &&
    (process.env.NODE_ENV !== 'production' || process.env.STAGING === 'true');
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-5 pb-10 pt-6 sm:px-8 sm:pt-12">
      <SignInFlow devNotice={devNotice} next={typeof next === 'string' ? next : undefined} />
    </main>
  );
}
