import type { Locale } from '@jordan-sports/i18n';
import { setRequestLocale } from 'next-intl/server';
import { use } from 'react';
import { SupportCenter } from '@/components/support-center';

type Props = {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<{ booking?: string; ref?: string; venue?: string }>;
};

export const metadata = { robots: { index: false } };

const uuid = /^[0-9a-f-]{36}$/i;

export default function SupportPage({ params, searchParams }: Props) {
  const { locale } = use(params);
  const query = use(searchParams);
  setRequestLocale(locale);
  const bookingId = query.booking && uuid.test(query.booking) ? query.booking : undefined;
  const venueId = query.venue && uuid.test(query.venue) ? query.venue : undefined;
  const ref = query.ref && /^[A-Z0-9-]{3,20}$/.test(query.ref) ? query.ref : undefined;
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-5 pb-10 pt-8 sm:px-8 sm:pt-12">
      <SupportCenter bookingId={bookingId} bookingReference={ref} venueId={venueId} />
    </main>
  );
}
