import type { Locale } from '@jordan-sports/i18n';
import { setRequestLocale } from 'next-intl/server';
import { use } from 'react';
import { RegisterWizard } from '@/components/manage/register-wizard';
import { wizardSteps, type WizardStep } from '@/lib/wizard-steps';

export const metadata = { robots: { index: false } };

type Props = {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<{ venueId?: string; step?: string }>;
};

export default function RegisterVenuePage({ params, searchParams }: Props) {
  const { locale } = use(params);
  const { venueId, step } = use(searchParams);
  setRequestLocale(locale);
  const validVenueId = venueId && /^[0-9a-f-]{36}$/.test(venueId) ? venueId : undefined;
  const validStep: WizardStep = (wizardSteps as readonly string[]).includes(step ?? '')
    ? (step as WizardStep)
    : 'info';
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-5 pb-10 pt-8 sm:px-8 sm:pt-12">
      <RegisterWizard venueId={validVenueId} initialStep={validStep} />
    </main>
  );
}
