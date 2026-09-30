import type { Locale } from '@jordan-sports/i18n';
import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { use } from 'react';
import { BookingView } from '@/components/booking-view';

type Props = {
  params: Promise<{ locale: Locale; bookingId: string }>;
  searchParams: Promise<{ confirmed?: string; payment?: string }>;
};

export const metadata = { robots: { index: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function BookingPage({ params, searchParams }: Props) {
  const { locale, bookingId } = use(params);
  const { confirmed, payment } = use(searchParams);
  setRequestLocale(locale);
  if (!UUID.test(bookingId)) notFound();
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-5 pb-10 pt-8 sm:px-8 sm:pt-12">
      <BookingView
        bookingId={bookingId}
        justConfirmed={confirmed === '1'}
        returning={payment === 'return'}
      />
    </main>
  );
}
