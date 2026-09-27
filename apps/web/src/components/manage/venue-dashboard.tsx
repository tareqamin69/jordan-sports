'use client';

import { Alert, PageHeader, Spinner, cx } from '@jordan-sports/ui';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import { isApiError } from '@/lib/api';
import { pick } from '@/lib/localized';
import { useVenueSchedule } from '@/lib/manage';
import { tabs, type Tab } from '@/lib/manage-tabs';
import { useErrorMessage } from '@/lib/use-error-message';
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
      <PageHeader title={pick(s.venue.name, locale)} description={t('title')} />
      <nav aria-label={t('tabs.label')} className="mb-6 overflow-x-auto border-b border-line">
        <ul className="flex gap-1">
          {tabs.map((key) => (
            <li key={key}>
              <Link
                href={{
                  pathname: `/manage/${venueId}`,
                  query: key === 'calendar' ? {} : { tab: key },
                }}
                aria-current={tab === key ? 'page' : undefined}
                className={cx(
                  'block whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium',
                  tab === key
                    ? 'border-brand-700 text-brand-900'
                    : 'border-transparent text-ink-muted hover:text-ink',
                )}
              >
                {t(`tabs.${key}`)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {tab === 'calendar' ? <CalendarView schedule={s} /> : null}
      {tab === 'hours' ? <HoursEditor schedule={s} /> : null}
      {tab === 'rules' ? <RulesEditor schedule={s} /> : null}
      {tab === 'pricing' ? <PricingEditor schedule={s} /> : null}
      {tab === 'closures' ? <ClosuresEditor schedule={s} /> : null}
    </>
  );
}
