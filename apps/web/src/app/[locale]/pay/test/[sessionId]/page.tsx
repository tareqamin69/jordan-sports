import type { Locale } from '@jordan-sports/i18n';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { use } from 'react';
import { TestPayment } from '@/components/test-payment';

type Props = { params: Promise<{ locale: Locale; sessionId: string }> };

export const metadata = { robots: { index: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The mock card gateway's hosted payment page (staging only, ADR-0020). The real gateway hosts
 * its own page instead; the API answers 404 here when it is configured.
 */
export default function TestPaymentPage({ params }: Props) {
  const { locale, sessionId } = use(params);
  setRequestLocale(locale);
  if (!UUID.test(sessionId)) notFound();
  return (
    <main className="mx-auto w-full max-w-md flex-1 px-5 pb-10 pt-8 sm:pt-12">
      <TestPayment sessionId={sessionId} />
    </main>
  );
}
