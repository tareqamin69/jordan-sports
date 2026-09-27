'use client';

import { Alert, PageHeader, Spinner, chipClass } from '@jordan-sports/ui';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import { isApiError } from '@/lib/api';
import { pick } from '@/lib/localized';
import { useVenueSchedule } from '@/lib/manage';
import { tabs, type Tab } from '@/lib/manage-tabs';
import { useErrorMessage } from '@/lib/use-error-message';
import { BookingsPanel } from './bookings-panel';
import { CalendarView } from './calendar-view';
import { ClosuresEditor } from './closures-editor';
import { HoursEditor } from './hours-editor';
import { PricingEditor } from './pricing-editor';
import { RulesEditor } from './rules-editor';

export function VenueDashboard({ venueId, tab }: { venueId: string; tab: Tab }) {
  const t = useTranslations('web.manage');
  const tc = useTranslations('common');
  const locale = useLocale();
  const router = useRouter();
  const errorMessage = useErrorMessage();
  const schedule = useVenueSchedule(venueId);

  useEffect(() => {
    if (isApiError(schedule.error, 'UNAUTHENTICATED')) router.replace('/sign-in');
  }, [schedule.error, router]);

  if (schedule.isPending) return <Spinner label={tc('loading')} />;
  if (schedule.isError) return <Alert tone="error">{errorMessage(schedule.error)}</Alert>;
  const s = schedule.data;

  return (
    <>
      <PageHeader eyebrow={t('title')} title={pick(s.venue.name, locale)} />
      <nav aria-label={t('tabs.label')} className="-mx-5 -mt-2 mb-8 sm:mx-0">
        <ul className="no-scrollbar flex gap-2 overflow-x-auto px-5 pb-1 sm:flex-wrap sm:px-0">
          {tabs.map((key) => (
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
      {tab === 'hours' ? <HoursEditor schedule={s} /> : null}
      {tab === 'rules' ? <RulesEditor schedule={s} /> : null}
      {tab === 'pricing' ? <PricingEditor schedule={s} /> : null}
      {tab === 'closures' ? <ClosuresEditor schedule={s} /> : null}
    </>
  );
}
