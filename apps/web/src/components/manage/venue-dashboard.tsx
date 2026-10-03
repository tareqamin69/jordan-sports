'use client';

import { getMyVenueProfile } from '@jordan-sports/contracts/web';
import {
  Alert,
  ListSkeleton,
  PageHeader,
  SelectChevron,
  Skeleton,
  SkeletonGroup,
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
import { tabPermission, tabs, type Tab } from '@/lib/manage-tabs';
import { useActiveInView } from '@/lib/use-active-in-view';
import { useErrorMessage } from '@/lib/use-error-message';
import { EarningsPanel } from './earnings-panel';
import { BookingsPanel } from './bookings-panel';
import { CalendarView } from './calendar-view';
import { ClosuresEditor } from './closures-editor';
import { HoursEditor } from './hours-editor';
import { OnboardingChecklist } from './onboarding-checklist';
import { PricingEditor } from './pricing-editor';
import { RulesEditor } from './rules-editor';
import { MyComplaints, ReportForm } from '../support-center';
import { ReportsPanel, VenueSettingsPanel } from './reports-panel';
import { TeamPanel } from './team-panel';
import { VenueProfilePanel } from './venue-profile-panel';
import { TodayPanel } from './today-panel';

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
            query: tab === 'today' ? {} : { tab },
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
  const tabList = useActiveInView<HTMLUListElement>(`${tab}:${Boolean(schedule.data)}`);

  useEffect(() => {
    if (isApiError(schedule.error, 'UNAUTHENTICATED')) router.replace('/sign-in');
  }, [schedule.error, router]);

  // Each role sees only its tabs.
  const visible = (key: Tab) => can(schedule.data, tabPermission[key]);

  if (schedule.isPending) {
    return (
      <SkeletonGroup label={tc('loading')} className="flex flex-col gap-6">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-10 w-64" />
        <div className="flex gap-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-11 w-24 rounded-full" />
          ))}
        </div>
        <ListSkeleton label={tc('loading')} rows={3} thumb={false} />
      </SkeletonGroup>
    );
  }
  if (schedule.isError) return <Alert tone="error">{errorMessage(schedule.error)}</Alert>;
  const s = schedule.data;
  // A tab the role can't use (e.g. an old link) falls back to today's view.
  const shown: Tab = visible(tab) ? tab : 'today';

  return (
    <>
      <PageHeader
        eyebrow={t('title')}
        title={pick(s.venue.name, locale)}
        actions={<VenueSwitcher venueId={venueId} tab={tab} />}
      />
      <VenueStatusBanner venueId={venueId} status={s.venue.status} />
      <OnboardingChecklist schedule={s} />
      <nav aria-label={t('tabs.label')} className="-mx-5 -mt-2 mb-8 sm:mx-0">
        <ul
          ref={tabList}
          className="no-scrollbar flex gap-2 overflow-x-auto px-5 pb-1 sm:flex-wrap sm:px-0"
        >
          {tabs
            .filter((key) => visible(key))
            .map((key) => (
              <li key={key}>
                <Link
                  href={{
                    pathname: `/manage/${venueId}`,
                    query: key === 'today' ? {} : { tab: key },
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
      {/* Keyed by tab so each tab's content eases in. */}
      <div key={shown} className="animate-rise">
        {shown === 'today' ? <TodayPanel schedule={s} /> : null}
        {shown === 'calendar' ? <CalendarView schedule={s} /> : null}
        {shown === 'team' ? <TeamPanel venueId={venueId} /> : null}
        {shown === 'reports' ? <ReportsPanel venueId={venueId} /> : null}
        {shown === 'settings' ? (
          <div className="flex flex-col gap-6">
            <VenueProfilePanel schedule={s} />
            <VenueSettingsPanel schedule={s} />
          </div>
        ) : null}
        {shown === 'bookings' ? <BookingsPanel schedule={s} /> : null}
        {shown === 'earnings' ? <EarningsPanel schedule={s} /> : null}
        {shown === 'hours' ? <HoursEditor schedule={s} /> : null}
        {shown === 'rules' ? <RulesEditor schedule={s} /> : null}
        {shown === 'pricing' ? <PricingEditor schedule={s} /> : null}
        {shown === 'closures' ? <ClosuresEditor schedule={s} /> : null}
        {shown === 'support' ? (
          <div className="flex flex-col gap-4">
            <ReportForm venueId={venueId} asVenue />
            <MyComplaints venueId={venueId} />
          </div>
        ) : null}
      </div>
    </>
  );
}
