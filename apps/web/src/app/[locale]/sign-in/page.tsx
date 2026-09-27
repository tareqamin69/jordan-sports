import type { Locale } from '@jordan-sports/i18n';
import { setRequestLocale } from 'next-intl/server';
import { use } from 'react';
import { SignInFlow } from '@/components/sign-in-flow';

type Props = { params: Promise<{ locale: Locale }> };

export const metadata = { robots: { index: false } };

export default function SignInPage({ params }: Props) {
  const { locale } = use(params);
  setRequestLocale(locale);
  // The development console channel is the only OTP channel until an SMS/WhatsApp provider is
  // chosen, so the notice is shown unless another channel is configured.
  const devNotice = (process.env.OTP_CHANNEL ?? 'console') === 'console';
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">
      <SignInFlow devNotice={devNotice} />
    </main>
  );
}
