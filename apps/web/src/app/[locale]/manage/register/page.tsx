import type { Locale } from '@jordan-sports/i18n';
import { setRequestLocale } from 'next-intl/server';
import { use } from 'react';
import { RegisterWizard } from '@/components/manage/register-wizard';

export const metadata = { robots: { index: false } };

type Props = {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<{ venueId?: string }>;
};

export default function RegisterVenuePage({ params, searchParams }: Props) {
  const { locale } = use(params);
  const { venueId } = use(searchParams);
  setRequestLocale(locale);
  const validVenueId = venueId && /^[0-9a-f-]{36}$/.test(venueId) ? venueId : undefined;
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-5 pb-10 pt-8 sm:px-8 sm:pt-12">
      <RegisterWizard venueId={validVenueId} />
    </main>
  );
}
