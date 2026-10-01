'use client';

import { listVenues, type VenueSummary } from '@jordan-sports/contracts';
import { Button } from '@jordan-sports/ui';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { useApi } from '@/lib/api';
import { useErrorMessage } from '@/lib/use-error-message';
import { VenueCard } from './venue-card';

type Filters = { sport?: string; governorate?: string; area?: string };

/** The venues grid with "show more" (cursor paging) after the server-rendered first page. */
export function VenueResults({
  initial,
  nextCursor,
  filters,
  date,
  pageSize,
}: {
  initial: VenueSummary[];
  nextCursor: string | null;
  filters: Filters;
  date?: string | undefined;
  pageSize: number;
}) {
  const t = useTranslations('common.actions');
  const locale = useLocale();
  const api = useApi();
  const errorMessage = useErrorMessage();
  const [items, setItems] = useState(initial);
  const [cursor, setCursor] = useState(nextCursor);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function more() {
    if (!cursor) return;
    setBusy(true);
    setError(null);
    try {
      const page = await api(listVenues, { query: { ...filters, limit: pageSize, cursor } });
      setItems((list) => [...list, ...page.items.filter((v) => !list.some((x) => x.id === v.id))]);
      setCursor(page.nextCursor);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <ul className="reveal-stagger mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((v) => (
          <li key={v.id}>
            <VenueCard venue={v} locale={locale} date={date} />
          </li>
        ))}
      </ul>
      {cursor ? (
        <div className="mt-8 flex flex-col items-center gap-2">
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <Button
            variant="secondary"
            busy={busy}
            onClick={() => void more()}
            data-testid="venues-more"
          >
            {t('loadMore')}
          </Button>
        </div>
      ) : null}
    </>
  );
}
