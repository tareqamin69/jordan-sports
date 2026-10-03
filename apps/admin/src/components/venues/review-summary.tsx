'use client';

import {
  adminGetVenueReviewSummary,
  type AdminVenue,
  type VenueReviewSummary,
} from '@jordan-sports/contracts/web';
import { formatMoney } from '@jordan-sports/money';
import { Alert, Button, Card, Ltr, SkeletonGroup, SkeletonText } from '@jordan-sports/ui';
import { useQuery } from '@tanstack/react-query';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { displayPhone } from '@/lib/format';
import { useApi } from '@/lib/api';
import { pick } from '@/lib/localized';
import { useErrorMessage } from '@/lib/use-error-message';

const time = (minutes: number) => {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

type Resource = VenueReviewSummary['resources'][number];

/** Groups consecutive ISO weekdays that share the same window into ranges. */
export function groupHours(windows: Resource['weeklyHours']) {
  const byKey = new Map<string, number[]>();
  for (const w of windows) {
    const key = `${w.startMinute}-${w.durationMinutes}`;
    byKey.set(key, [...(byKey.get(key) ?? []), w.dayOfWeek]);
  }
  return [...byKey.entries()].map(([key, days]) => {
    const [start, duration] = key.split('-').map(Number) as [number, number];
    const sorted = [...days].sort((a, b) => a - b);
    const runs: Array<[number, number]> = [];
    for (const d of sorted) {
      const last = runs.at(-1);
      if (last && last[1] === d - 1) last[1] = d;
      else runs.push([d, d]);
    }
    return { runs, text: `${time(start)}–${time(start + duration)}` };
  });
}

/** Compact "what am I approving" summary for the reviewer (QA #12). */
export function ReviewSummary({ venue }: { venue: AdminVenue }) {
  const t = useTranslations('admin.venues.summary');
  const tc = useTranslations('common');
  const locale = useLocale();
  const format = useFormatter();
  const api = useApi();
  const errorMessage = useErrorMessage();
  const [mapOpen, setMapOpen] = useState(false);
  const summary = useQuery({
    queryKey: ['venue-review-summary', venue.id],
    queryFn: () => api(adminGetVenueReviewSummary, { params: { venueId: venue.id } }),
  });
  const weekday = (d: number) =>
    format.dateTime(new Date(Date.UTC(2024, 0, d)), { weekday: 'short', timeZone: 'UTC' });
  const dayRange = ([a, b]: [number, number]) =>
    a === b ? weekday(a) : `${weekday(a)}–${weekday(b)}`;
  const bySummary = new Map(summary.data?.resources.map((r) => [r.id, r]));
  const resources = venue.resources.filter((r) => r.status !== 'archived');
  const digits = venue.contactPhone ?? venue.ownerPhone;

  return (
    <Card data-testid="review-summary" className="flex flex-col gap-5">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <section>
            <h2 className="mb-2 text-sm font-medium text-ink-muted">{t('courts')}</h2>
            {summary.isError ? <Alert tone="error">{errorMessage(summary.error)}</Alert> : null}
            {summary.isPending ? (
              <SkeletonGroup label={tc('loading')}>
                <SkeletonText lines={4} />
              </SkeletonGroup>
            ) : null}
            {resources.length === 0 ? <p className="text-sm text-danger">{t('noCourts')}</p> : null}
            <ul className="flex flex-col gap-3">
              {resources.map((r) => {
                const s = bySummary.get(r.id);
                const hours = s ? groupHours(s.weeklyHours) : [];
                return (
                  <li key={r.id} className="rounded-lg bg-canvas p-3 text-sm">
                    <p className="font-medium">
                      {pick(r.name, locale)} · {pick(r.type.name, locale)}
                    </p>
                    <p className="text-ink-muted">
                      {r.formats.map((f) => pick(f.name, locale)).join('، ')}
                    </p>
                    {s ? (
                      <>
                        <p className="mt-1">
                          <span className="text-ink-muted">{t('hours')}: </span>
                          {hours.length === 0 ? (
                            <span className="text-danger">{t('noHours')}</span>
                          ) : (
                            hours.map((h, i) => (
                              <span key={i}>
                                {i > 0 ? ' · ' : ''}
                                {h.runs.map(dayRange).join('، ')} <Ltr>{h.text}</Ltr>
                              </span>
                            ))
                          )}
                        </p>
                        <p>
                          <span className="text-ink-muted">{t('prices')}: </span>
                          {s.prices.length === 0 ? (
                            <span className="text-danger">{t('noPrices')}</span>
                          ) : (
                            s.prices.map((p, i) => (
                              <span key={i}>
                                {i > 0 ? ' · ' : ''}
                                {p.amounts
                                  .map(
                                    (a) =>
                                      `${a.durationMinutes}′ ${formatMoney({ amount: a.amount, currency: p.currency }, locale)}`,
                                  )
                                  .join('، ')}
                              </span>
                            ))
                          )}
                        </p>
                      </>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
          <section>
            <h2 className="mb-2 text-sm font-medium text-ink-muted">
              {t('photos', { count: venue.media.length })}
            </h2>
            {venue.media.length === 0 ? (
              <p className="text-sm text-danger">{t('noPhotos')}</p>
            ) : (
              <ul className="flex gap-2 overflow-x-auto">
                {venue.media.map((m) => (
                  <li key={m.id} className="shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element -- private admin preview */}
                    <img
                      src={`/api/v1/admin/media/${m.id}`}
                      alt=""
                      width={96}
                      height={64}
                      className="h-16 w-24 rounded-md object-cover"
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="text-sm">
            <h2 className="mb-1 text-sm font-medium text-ink-muted">{t('owner')}</h2>
            <p>
              {venue.ownerName ?? '-'}{' '}
              {venue.ownerPhone ? (
                <>
                  <Ltr>{displayPhone(venue.ownerPhone)}</Ltr>{' '}
                  <a className="text-primary" href={`tel:${venue.ownerPhone}`}>
                    {t('call')}
                  </a>{' '}
                  ·{' '}
                  <a
                    className="text-primary"
                    href={`https://wa.me/${venue.ownerPhone.replace(/[^0-9]/g, '')}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t('whatsapp')}
                  </a>
                </>
              ) : null}
            </p>
            {digits && digits !== venue.ownerPhone ? (
              <p className="text-ink-muted">
                {t('venuePhone')}: <Ltr>{displayPhone(digits)}</Ltr>
              </p>
            ) : null}
          </section>
        </div>
        <section>
          <h2 className="mb-2 text-sm font-medium text-ink-muted">{t('location')}</h2>
          {venue.location && !mapOpen ? (
            // The embed comes from openstreetmap.org: load it only when asked.
            <Button size="sm" variant="secondary" onClick={() => setMapOpen(true)}>
              {t('showMap')}
            </Button>
          ) : venue.location ? (
            <iframe
              title={t('location')}
              loading="lazy"
              className="aspect-[4/3] w-full rounded-lg border border-line"
              src={`https://www.openstreetmap.org/export/embed.html?bbox=${venue.location.lng - 0.006}%2C${venue.location.lat - 0.004}%2C${venue.location.lng + 0.006}%2C${venue.location.lat + 0.004}&layer=mapnik&marker=${venue.location.lat}%2C${venue.location.lng}`}
            />
          ) : (
            <p className="text-sm text-danger">{t('noLocation')}</p>
          )}
        </section>
      </div>
    </Card>
  );
}
