'use client';

import {
  listMyComplaints,
  replyToMyComplaint,
  reportProblem,
  reportVenueProblem,
  type Complaint,
  type ComplaintCategory,
} from '@jordan-sports/contracts';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  FormSkeleton,
  ListSkeleton,
  Ltr,
  PageHeader,
  SelectField,
  TextAreaField,
  cx,
  useToast,
} from '@jordan-sports/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from '@/i18n/navigation';
import { useApi } from '@/lib/api';
import { useMe } from '@/lib/session';
import { useErrorMessage } from '@/lib/use-error-message';

const PLAYER_CATEGORIES: ComplaintCategory[] = ['booking', 'venue', 'payment', 'app', 'other'];
const VENUE_CATEGORIES: ComplaintCategory[] = [
  'player_behaviour',
  'booking',
  'payment',
  'app',
  'other',
];

function useMyComplaints() {
  const api = useApi();
  return useQuery({ queryKey: ['my-complaints'], queryFn: () => api(listMyComplaints) });
}

/** The report form, for a player (optionally about a booking) or for a venue. */
export function ReportForm({
  venueId,
  bookingId,
  bookingReference,
  asVenue = false,
}: {
  venueId?: string | undefined;
  bookingId?: string | undefined;
  bookingReference?: string | undefined;
  asVenue?: boolean;
}) {
  const t = useTranslations('web.support');
  const api = useApi();
  const queryClient = useQueryClient();
  const errorMessage = useErrorMessage();
  const toast = useToast();
  const categories = asVenue ? VENUE_CATEGORIES : PLAYER_CATEGORIES;
  const [category, setCategory] = useState<ComplaintCategory>(
    bookingId ? 'booking' : categories[0]!,
  );
  const [body, setBody] = useState('');
  const send = useMutation({
    mutationFn: () => {
      const payload = { category, body, ...(bookingId ? { bookingId } : {}) };
      return asVenue && venueId
        ? api(reportVenueProblem, { params: { venueId }, body: payload })
        : api(reportProblem, {
            body: { ...payload, ...(venueId && !bookingId ? { venueId } : {}) },
          });
    },
    onSuccess: (sent) => {
      setBody('');
      toast(t('sent', { reference: sent.reference }));
      void queryClient.invalidateQueries({ queryKey: ['my-complaints'] });
    },
  });
  return (
    <Card>
      <form
        className="flex flex-col gap-4"
        data-testid="report-form"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          if (body.trim().length >= 5) send.mutate();
        }}
      >
        {bookingReference ? (
          <p className="text-sm text-ink-muted">
            {t('aboutBooking', { reference: bookingReference })}
          </p>
        ) : null}
        {send.isError ? <Alert tone="error">{errorMessage(send.error)}</Alert> : null}
        <SelectField
          label={t('category')}
          value={category}
          onChange={(e) => setCategory(e.target.value as ComplaintCategory)}
          name="category"
        >
          {categories.map((c) => (
            <option key={c} value={c}>
              {t(`categories.${c}`)}
            </option>
          ))}
        </SelectField>
        <TextAreaField
          label={t('body')}
          hint={t('bodyHint')}
          rows={4}
          maxLength={4000}
          required
          value={body}
          onChange={(e) => setBody(e.target.value)}
          name="body"
        />
        <div>
          <Button type="submit" busy={send.isPending} disabled={body.trim().length < 5}>
            {t('send')}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function Thread({ complaint }: { complaint: Complaint }) {
  const t = useTranslations('web.support');
  const format = useFormatter();
  const api = useApi();
  const queryClient = useQueryClient();
  const errorMessage = useErrorMessage();
  const [reply, setReply] = useState('');
  const send = useMutation({
    mutationFn: () =>
      api(replyToMyComplaint, { params: { complaintId: complaint.id }, body: { body: reply } }),
    meta: { toast: t('replySent') },
    onSuccess: () => {
      setReply('');
      void queryClient.invalidateQueries({ queryKey: ['my-complaints'] });
    },
  });
  return (
    <li className="py-4" data-testid="my-complaint">
      <div className="flex flex-wrap items-center gap-2">
        <Ltr>{complaint.reference}</Ltr>
        <Badge>{t(`statuses.${complaint.status}`)}</Badge>
        <span className="text-xs text-ink-muted">
          {t(`categories.${complaint.category}`)} ·{' '}
          {format.dateTime(new Date(complaint.createdAt), { dateStyle: 'medium' })}
        </span>
      </div>
      <p className="mt-2 whitespace-pre-wrap text-sm">{complaint.body}</p>
      {complaint.messages.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-2">
          {complaint.messages.map((m) => (
            <li
              key={m.id}
              className={cx(
                'rounded-2xl p-3 text-sm',
                m.authorKind === 'staff' ? 'bg-brand-50' : 'bg-canvas',
              )}
            >
              <p className="text-xs text-ink-muted">
                {m.authorKind === 'staff' ? t('team') : t('you')}
              </p>
              <p className="whitespace-pre-wrap">{m.body}</p>
            </li>
          ))}
        </ul>
      ) : null}
      {send.isError ? (
        <Alert tone="error" className="mt-2">
          {errorMessage(send.error)}
        </Alert>
      ) : null}
      <form
        className="mt-3 flex flex-wrap items-end gap-2"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          if (reply.trim()) send.mutate();
        }}
      >
        <div className="min-w-0 flex-1">
          <TextAreaField
            label={t('reply')}
            rows={2}
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            name={`reply-${complaint.id}`}
          />
        </div>
        <Button type="submit" size="sm" variant="secondary" busy={send.isPending}>
          {t('sendReply')}
        </Button>
      </form>
    </li>
  );
}

/** The signed-in user's reports (optionally only those for one venue). */
export function MyComplaints({ venueId }: { venueId?: string }) {
  const t = useTranslations('web.support');
  const tc = useTranslations('common');
  const errorMessage = useErrorMessage();
  const mine = useMyComplaints();
  if (mine.isPending) return <ListSkeleton label={tc('loading')} rows={2} thumb={false} />;
  if (mine.isError) return <Alert tone="error">{errorMessage(mine.error)}</Alert>;
  const items = mine.data.items.filter((c) =>
    venueId ? c.reporterKind === 'venue' && c.venue?.id === venueId : c.reporterKind === 'player',
  );
  return (
    <Card>
      <h2 className="font-display text-2xl">{t('mine')}</h2>
      {items.length === 0 ? (
        <EmptyState art="inbox" title={t('none')} className="mt-4 border-0 bg-transparent py-6" />
      ) : (
        <ul className="divide-y divide-line">
          {items.map((c) => (
            <Thread key={c.id} complaint={c} />
          ))}
        </ul>
      )}
    </Card>
  );
}

/** Players: report a problem (optionally about a booking or venue) and follow their reports. */
export function SupportCenter({
  bookingId,
  bookingReference,
  venueId,
}: {
  bookingId?: string | undefined;
  bookingReference?: string | undefined;
  venueId?: string | undefined;
}) {
  const t = useTranslations('web.support');
  const tc = useTranslations('common');
  const me = useMe();
  const router = useRouter();
  useEffect(() => {
    if (me.data === null) router.replace('/sign-in');
  }, [me.data, router]);
  if (me.isPending || me.data === null) return <FormSkeleton label={tc('loading')} fields={2} />;
  return (
    <div className="flex animate-rise flex-col gap-4">
      <PageHeader title={t('title')} description={t('description')} />
      <ReportForm venueId={venueId} bookingId={bookingId} bookingReference={bookingReference} />
      <MyComplaints />
    </div>
  );
}
