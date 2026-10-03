'use client';

import {
  adminCancelBooking,
  adminGetBooking,
  adminListBookings,
} from '@jordan-sports/contracts/web';
import { formatMoney } from '@jordan-sports/money';
import {
  Alert,
  Badge,
  Button,
  Card,
  DetailSkeleton,
  EmptyState,
  ListSkeleton,
  Ltr,
  PageHeader,
  SelectField,
  TextField,
} from '@jordan-sports/ui';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { useCan } from '@/lib/admin-session';
import { useApi } from '@/lib/api';
import { dmy, displayPhone } from '@/lib/format';
import { pick } from '@/lib/localized';
import { useErrorMessage } from '@/lib/use-error-message';

type Status = 'HELD' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED' | 'NO_SHOW';
const STATUSES: Status[] = ['HELD', 'CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW'];

export function BookingsPage() {
  const t = useTranslations('admin.bookings');
  const tb = useTranslations('web.booking.statuses');
  const tc = useTranslations('common');
  const locale = useLocale();
  const api = useApi();
  const errorMessage = useErrorMessage();
  const params = useSearchParams();
  const userId = params.get('user') ?? undefined;
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<{
    q: string;
    status: Status | '';
    from: string;
    to: string;
  }>({ q: '', status: '', from: '', to: '' });
  const [selected, setSelected] = useState<string | null>(null);
  const bookings = useInfiniteQuery({
    queryKey: ['admin-bookings', filters, userId],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      api(adminListBookings, {
        query: {
          limit: 50,
          ...(pageParam ? { cursor: pageParam } : {}),
          ...(userId ? { userId } : {}),
          ...(filters.q ? { q: filters.q } : {}),
          ...(filters.status ? { status: filters.status } : {}),
          ...(filters.from ? { from: filters.from } : {}),
          ...(filters.to ? { to: filters.to } : {}),
        },
      }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const items = bookings.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <>
      <PageHeader title={t('title')} description={t('description')} />
      <Card className="mb-4">
        <form
          className="grid items-end gap-3 sm:grid-cols-5"
          onSubmit={(e) => {
            e.preventDefault();
            setFilters((f) => ({ ...f, q: search.trim() }));
          }}
        >
          <TextField
            label={t('search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            type="search"
            name="bookingSearch"
          />
          <SelectField
            label={t('status')}
            value={filters.status}
            onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value as Status | '' }))}
            name="bookingStatus"
          >
            <option value="">{t('allStatuses')}</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {tb(s)}
              </option>
            ))}
          </SelectField>
          <TextField
            label={t('from')}
            type="date"
            dir="ltr"
            value={filters.from}
            onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))}
            name="bookingFrom"
          />
          <TextField
            label={t('to')}
            type="date"
            dir="ltr"
            value={filters.to}
            onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))}
            name="bookingTo"
          />
          <Button type="submit" variant="secondary">
            {tc('actions.search')}
          </Button>
        </form>
      </Card>
      {selected ? <BookingDetail id={selected} onClose={() => setSelected(null)} /> : null}
      {bookings.isPending ? <ListSkeleton label={tc('loading')} rows={5} thumb={false} /> : null}
      {bookings.isError ? <Alert tone="error">{errorMessage(bookings.error)}</Alert> : null}
      {bookings.data && items.length === 0 ? (
        <EmptyState art="bookings" title={t('empty')} />
      ) : null}
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
                    <button
                      type="button"
                      className="text-primary underline-offset-2 hover:underline"
                      onClick={() => setSelected(b.id)}
                    >
                      <Ltr>{b.reference}</Ltr>
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    {pick(b.venue.name, locale)} · {pick(b.resource.name, locale)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {dmy(b.businessDate)}{' '}
                    <Ltr>
                      {b.localStart}–{b.localEnd}
                    </Ltr>
                  </td>
                  <td className="px-4 py-3">
                    {b.customer.name}
                    {b.customer.phone ? (
                      <span className="block text-xs text-ink-muted">
                        <Ltr>{displayPhone(b.customer.phone)}</Ltr>
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

function BookingDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const t = useTranslations('admin.bookings');
  const tt = useTranslations('common.toast');
  const tb = useTranslations('web.booking.statuses');
  const tc = useTranslations('common');
  const format = useFormatter();
  const api = useApi();
  const can = useCan();
  const queryClient = useQueryClient();
  const errorMessage = useErrorMessage();
  const detail = useQuery({
    queryKey: ['admin-booking', id],
    queryFn: () => api(adminGetBooking, { params: { bookingId: id } }),
  });
  const [reason, setReason] = useState('');
  const cancel = useMutation({
    meta: { toast: tt('cancelled') },
    mutationFn: () => api(adminCancelBooking, { params: { bookingId: id }, body: { reason } }),
    onSuccess: (data) => {
      queryClient.setQueryData(['admin-booking', id], data);
      void queryClient.invalidateQueries({ queryKey: ['admin-bookings'] });
      setReason('');
    },
  });
  if (detail.isError) return <Alert tone="error">{errorMessage(detail.error)}</Alert>;
  if (!detail.data) return <DetailSkeleton label={tc('loading')} />;
  const b = detail.data;
  const cancellable = b.status === 'HELD' || b.status === 'CONFIRMED';
  return (
    <Card className="mb-4" data-testid="booking-detail">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-xl">
          <Ltr>{b.reference}</Ltr> · {tb(b.status)}
        </h2>
        <Button size="sm" variant="ghost" onClick={onClose}>
          {t('close')}
        </Button>
      </div>
      {b.cancelReason ? (
        <p className="mt-2 text-sm">{t('cancelReason', { reason: b.cancelReason })}</p>
      ) : null}
      <h3 className="mt-4 font-medium">{t('history')}</h3>
      <ul className="mt-2 text-sm">
        {b.history.map((h, i) => (
          <li key={i}>
            {format.dateTime(new Date(h.at), { dateStyle: 'short', timeStyle: 'short' })} ·{' '}
            {h.from ? `${tb(h.from as Status)} → ` : ''}
            {tb(h.to as Status)} · {t(`actors.${h.actorType as 'customer'}`)}
            {h.reason ? ` · ${h.reason}` : ''}
          </li>
        ))}
      </ul>
      {cancellable && can('bookings.cancel') ? (
        <form
          className="mt-4 flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            cancel.mutate();
          }}
        >
          {cancel.isError ? <Alert tone="error">{errorMessage(cancel.error)}</Alert> : null}
          <div className="min-w-0 flex-1">
            <TextField
              label={t('cancelReasonLabel')}
              required
              minLength={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              name="cancelReason"
            />
          </div>
          <Button type="submit" variant="danger" busy={cancel.isPending}>
            {t('cancel')}
          </Button>
        </form>
      ) : null}
    </Card>
  );
}
