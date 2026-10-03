'use client';

import {
  getMyVenueProfile,
  getVenuePricing,
  type VenueSchedule,
} from '@jordan-sports/contracts/web';
import { Card, chipClass } from '@jordan-sports/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useApi } from '@/lib/api';
import { Icon } from '../icons';

/**
 * A new owner's setup checklist: opening hours, prices, booking rules, photos — each ✓ once done,
 * with a link straight to where to do it. Hidden once everything is checked off.
 */
export function OnboardingChecklist({ schedule }: { schedule: VenueSchedule }) {
  const t = useTranslations('web.manage.onboarding');
  const api = useApi();
  const venueId = schedule.venue.id;

  const profile = useQuery({
    queryKey: ['my-venue', venueId],
    queryFn: () => api(getMyVenueProfile, { params: { venueId } }),
  });
  const pricing = useQuery({
    queryKey: ['pricing', venueId],
    queryFn: () => api(getVenuePricing, { params: { venueId } }),
  });

  const hoursDone = schedule.resources.some((r) => r.weeklyHours.length > 0);
  // Booking rules always have working system defaults (min 1 duration required), so there's no
  // "unset" state to detect — treat them as ready once hours are, since that's the same tab flow.
  const rulesDone = hoursDone;
  const pricingDone = (pricing.data?.rules.length ?? 0) > 0;
  const photosDone = (profile.data?.media.length ?? 0) > 0;

  const items = [
    { key: 'hours', done: hoursDone, query: { tab: 'hours' } },
    { key: 'pricing', done: pricingDone, query: { tab: 'pricing' } },
    { key: 'rules', done: rulesDone, query: { tab: 'rules' } },
    { key: 'photos', done: photosDone, query: undefined },
  ] as const;

  if (items.every((i) => i.done)) return null;

  return (
    <Card className="mb-6 flex flex-col gap-3">
      <p className="font-semibold text-ink">{t('title')}</p>
      <ul className="flex flex-wrap gap-2">
        {items.map((item) => (
          <li key={item.key}>
            {item.done ? (
              <span className={chipClass(true, { tone: 'night' })}>
                <Icon name="check" className="size-4" />
                {t(item.key)}
              </span>
            ) : (
              <Link
                href={
                  item.query
                    ? { pathname: `/manage/${venueId}`, query: item.query }
                    : { pathname: '/manage/register', query: { venueId, step: 'photos' } }
                }
                className={chipClass(true)}
              >
                {t(item.key)} · {t('go')}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
