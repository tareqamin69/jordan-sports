'use client';

import { getMyVenueProfile } from '@jordan-sports/contracts';
import {
  Alert,
  PageHeader,
  SelectChevron,
  Spinner,
  chipClass,
  cx,
  fieldControlClass,
} from '@jordan-sports/ui';
import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import { isApiError, useApi } from '@/lib/api';
import { pick } from '@/lib/localized';
import { can, useManagedVenues, useVenueSchedule } from '@/lib/manage';
import { tabs, type Tab } from '@/lib/manage-tabs';
import { useCatalog } from '@/lib/catalog';
import { useErrorMessage } from '@/lib/use-error-message';
import { BalanceBanner, BalancePanel, useVenueBalance } from './balance-panel';
import { BookingsPanel } from './bookings-panel';
import { CalendarView } from './calendar-view';
import { ClosuresEditor } from './closures-editor';
import { HoursEditor } from './hours-editor';
import { OnboardingChecklist } from './onboarding-checklist';
import { PaymentsPanel } from './payments-panel';
import { PricingEditor } from './pricing-editor';
import { RulesEditor } from './rules-editor';

/** Venue switcher: only shown when the signed-in user manages more than one venue. */
function VenueSwitcher({ venueId, tab }: { venueId: string; tab: Tab }) {
  const t = useTranslations('web.manage');
  const locale = useLocale();
  const router = useRouter();
  const venues = useManagedVenues();
  if (!venues.data || venues.data.items.length < 2) return null;

  return (
    <div className="relative w-full sm:w-64">
      <select
        aria-label={t('switchVenue')}
        value={venueId}
        onChange={(e) =>
          router.push({
            pathname: `/manage/${e.target.value}`,
            query: tab === 'calendar' ? {} : { tab },
          })
        }
        className={cx(fieldControlClass, 'appearance-none pe-11')}
      >
        {venues.data.items.map((v) => (
          <option key={v.id} value={v.id}>
            {pick(v.name, locale)}
          </option>
        ))}
      </select>
      <SelectChevron />
    </div>
  );
}

/** Surfaces the venue's registration status (draft/submitted/rejected/suspended) with next steps. */
function VenueStatusBanner({ venueId, status }: { venueId: string; status: string }) {
  const t = useTranslations('web.manage.status');
  const api = useApi();
  const profile = useQuery({
    queryKey: ['my-venue', venueId],
    queryFn: () => api(getMyVenueProfile, { params: { venueId } }),
    enabled: status === 'rejected',
  });
  if (status === 'approved') return null;

  const reason = profile.data?.statusReason;
  return (
    <Alert
      tone={status === 'rejected' || status === 'suspended' ? 'error' : 'info'}
      className="mb-6"
    >
      <div className="flex flex-col items-start gap-2">
        <span>
          {status === 'rejected'
            ? reason
              ? t('rejected', { reason })
              : t('rejectedNoReason')
            : t(status as 'draft' | 'submitted' | 'suspended')}
        </span>
        {status === 'draft' || status === 'rejected' ? (
          <Link
            href={{ pathname: '/manage/register', query: { venueId } }}
            className="text-sm font-semibold underline"
          >
            {status === 'draft' ? t('continueRegistration') : t('editAndResubmit')}
          </Link>
        ) : null}
      </div>
    </Alert>
  );
}

export function VenueDashboard({ venueId, tab }: { venueId: string; tab: Tab }) {
  const t = useTranslations('web.manage');
  const tc = useTranslations('common');
  const locale = useLocale();
  const router = useRouter();
  const errorMessage = useErrorMessage();
  const schedule = useVenueSchedule(venueId);
  // CliQ payments and the commission balance are built but switched off (ADR-0018).
  const cliqEnabled = useCatalog().data?.features.cliqPayments ?? false;
  const seesMoney = cliqEnabled && can(schedule.data, 'venue.manage');
  const balance = useVenueBalance(venueId, seesMoney);

  useEffect(() => {
    if (isApiError(schedule.error, 'UNAUTHENTICATED')) router.replace('/sign-in');
  }, [schedule.error, router]);

  if (schedule.isPending) return <Spinner label={tc('loading')} />;
  if (schedule.isError) return <Alert tone="error">{errorMessage(schedule.error)}</Alert>;
  const s = schedule.data;

  return (
    <>
      <PageHeader
        eyebrow={t('title')}
        title={pick(s.venue.name, locale)}
        actions={<VenueSwitcher venueId={venueId} tab={tab} />}
      />
      <VenueStatusBanner venueId={venueId} status={s.venue.status} />
      {balance.data?.cliqEnabled ? (
        <BalanceBanner venueId={venueId} balance={balance.data} />
      ) : null}
      <OnboardingChecklist schedule={s} />
      <nav aria-label={t('tabs.label')} className="-mx-5 -mt-2 mb-8 sm:mx-0">
        <ul className="no-scrollbar flex gap-2 overflow-x-auto px-5 pb-1 sm:flex-wrap sm:px-0">
          {tabs
            .filter((key) => (key === 'payments' ? cliqEnabled : key !== 'balance' || seesMoney))
            .map((key) => (
              <li key={key}>
                <Link
                  href={{
                    pathname: `/manage/${venueId}`,
                    query: key === 'calendar' ? {} : { tab: key },
                  }}
                  aria-current={tab === key ? 'page' : undefined}
                  className={chipClass(tab === key, {
                    tone: 'night',
                    className: 'whitespace-nowrap',
                  })}
                >
                  {t(`tabs.${key}`)}
                </Link>
              </li>
            ))}
        </ul>
      </nav>
      {tab === 'calendar' ? <CalendarView schedule={s} /> : null}
      {tab === 'bookings' ? <BookingsPanel schedule={s} /> : null}
      {tab === 'payments' && cliqEnabled ? <PaymentsPanel schedule={s} /> : null}
      {tab === 'balance' && seesMoney ? (
        <BalancePanel venueId={venueId} timezone={s.venue.timezone} />
      ) : null}
      {tab === 'hours' ? <HoursEditor schedule={s} /> : null}
      {tab === 'rules' ? <RulesEditor schedule={s} /> : null}
      {tab === 'pricing' ? <PricingEditor schedule={s} /> : null}
      {tab === 'closures' ? <ClosuresEditor schedule={s} /> : null}
    </>
  );
}
