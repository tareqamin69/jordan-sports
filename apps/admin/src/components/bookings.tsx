'use client';

import { adminListBookings } from '@jordan-sports/contracts';
import { formatMoney } from '@jordan-sports/money';
import { Alert, Badge, Button, Card, Ltr, PageHeader, Spinner } from '@jordan-sports/ui';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useApi } from '@/lib/api';
import { pick } from '@/lib/localized';
import { useErrorMessage } from '@/lib/use-error-message';

export function BookingsPage() {
  const t = useTranslations('admin.bookings');
  const tb = useTranslations('web.booking.statuses');
  const tc = useTranslations('common');
  const locale = useLocale();
  const format = useFormatter();
  const api = useApi();
  const errorMessage = useErrorMessage();
  const bookings = useInfiniteQuery({
    queryKey: ['admin-bookings'],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      api(adminListBookings, { query: { limit: 50, ...(pageParam ? { cursor: pageParam } : {}) } }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const items = bookings.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <>
      <PageHeader title={t('title')} description={t('description')} />
      {bookings.isPending ? <Spinner label={tc('loading')} /> : null}
      {bookings.isError ? <Alert tone="error">{errorMessage(bookings.error)}</Alert> : null}
      {bookings.data && items.length === 0 ? <p className="text-ink-muted">{t('empty')}</p> : null}
      {items.length > 0 ? (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-start text-sm">
            <thead className="bg-canvas text-ink-muted">
              <tr>
                {(
                  ['reference', 'venue', 'when', 'customer', 'price', 'channel', 'status'] as const
                ).map((key) => (
                  <th key={key} scope="col" className="px-4 py-3 text-start font-medium">
                    {t(key)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {items.map((b) => (
                <tr key={b.id} data-testid="admin-booking">
                  <td className="px-4 py-3 font-mono">
                    <Ltr>{b.reference}</Ltr>
                  </td>
                  <td className="px-4 py-3">
                    {pick(b.venue.name, locale)} · {pick(b.resource.name, locale)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {format.dateTime(new Date(`${b.businessDate}T12:00:00Z`), 'date')}{' '}
                    <Ltr>
                      {b.localStart}–{b.localEnd}
                    </Ltr>
                  </td>
                  <td className="px-4 py-3">
                    {b.customer.name}
                    {b.customer.phone ? (
                      <span className="block text-xs text-ink-muted">
                        <Ltr>{b.customer.phone}</Ltr>
                      </span>
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {b.price ? formatMoney(b.price, locale) : ''}
                  </td>
                  <td className="px-4 py-3">
                    {b.channel === 'MARKETPLACE' ? t('online') : t('byVenue')}
                  </td>
                  <td className="px-4 py-3">
                    <Badge>{tb(b.status)}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : null}
      {bookings.hasNextPage ? (
        <Button
          variant="secondary"
          className="mt-4"
          onClick={() => void bookings.fetchNextPage()}
          busy={bookings.isFetchingNextPage}
        >
          {tc('actions.loadMore')}
        </Button>
      ) : null}
    </>
  );
}
