'use client';

import {
  adminGetComplaint,
  adminListComplaints,
  adminReplyToComplaint,
  adminUpdateComplaint,
  type AdminComplaint,
  type ComplaintStatus,
} from '@jordan-sports/contracts/web';
import {
  Alert,
  Badge,
  Button,
  Card,
  CheckboxField,
  DetailSkeleton,
  ListSkeleton,
  Ltr,
  PageHeader,
  SelectField,
  TextAreaField,
  TextField,
  cx,
} from '@jordan-sports/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { useAdminMe, useCan } from '@/lib/admin-session';
import { displayPhone } from '@/lib/format';
import { useApi } from '@/lib/api';
import { pick } from '@/lib/localized';
import { useErrorMessage } from '@/lib/use-error-message';

const STATUSES: ComplaintStatus[] = ['new', 'in_progress', 'resolved'];

/** The team's complaints queue (docs/rbac-plan.md §7.4). */
export function ComplaintsPage() {
  const t = useTranslations('admin.complaints');
  const tc = useTranslations('common');
  const locale = useLocale();
  const format = useFormatter();
  const api = useApi();
  const errorMessage = useErrorMessage();
  const [status, setStatus] = useState<ComplaintStatus | ''>('new');
  const [assignee, setAssignee] = useState<'' | 'me' | 'none'>('');
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const list = useQuery({
    queryKey: ['complaints', status, assignee, q],
    queryFn: () =>
      api(adminListComplaints, {
        query: {
          limit: 50,
          ...(status ? { status } : {}),
          ...(assignee ? { assignee } : {}),
          ...(q.trim() ? { q: q.trim() } : {}),
        },
      }),
  });

  return (
    <>
      <PageHeader title={t('title')} description={t('description')} />
      <Card className="mb-4">
        <div className="grid items-end gap-3 sm:grid-cols-3">
          <SelectField
            label={t('status')}
            value={status}
            onChange={(e) => setStatus(e.target.value as ComplaintStatus | '')}
            name="complaintStatus"
          >
            <option value="">{t('all')}</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`statuses.${s}`)}
              </option>
            ))}
          </SelectField>
          <SelectField
            label={t('assignee')}
            value={assignee}
            onChange={(e) => setAssignee(e.target.value as '' | 'me' | 'none')}
            name="complaintAssignee"
          >
            <option value="">{t('anyone')}</option>
            <option value="me">{t('mine')}</option>
            <option value="none">{t('unassigned')}</option>
          </SelectField>
          <TextField
            label={tc('actions.search')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            name="complaintSearch"
          />
        </div>
      </Card>
      {list.isError ? <Alert tone="error">{errorMessage(list.error)}</Alert> : null}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <Card>
          {list.isPending ? (
            <ListSkeleton label={tc('loading')} rows={4} thumb={false} />
          ) : list.data?.items.length ? (
            <ul className="divide-y divide-line" data-testid="complaints-list">
              {list.data.items.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(c.id)}
                    className={cx(
                      'w-full py-3 text-start',
                      selected === c.id ? 'text-primary' : 'text-ink',
                    )}
                  >
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">
                        <Ltr>{c.reference}</Ltr>
                      </span>
                      <Badge>{t(`statuses.${c.status}`)}</Badge>
                      <span className="text-xs text-ink-muted">
                        {t(`categories.${c.category}`)} · {t(`kinds.${c.reporterKind}`)}
                      </span>
                    </span>
                    <span className="mt-1 line-clamp-2 block text-sm text-ink-muted">
                      {c.venue ? `${pick(c.venue.name, locale)} · ` : ''}
                      {c.body}
                    </span>
                    <span className="text-xs text-ink-muted">
                      {format.dateTime(new Date(c.createdAt), {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-ink-muted">{tc('empty')}</p>
          )}
        </Card>
        {selected ? <ComplaintDetail id={selected} /> : null}
      </div>
    </>
  );
}

function ComplaintDetail({ id }: { id: string }) {
  const t = useTranslations('admin.complaints');
  const tt = useTranslations('common.toast');
  const tc = useTranslations('common');
  const locale = useLocale();
  const format = useFormatter();
  const api = useApi();
  const can = useCan();
  const me = useAdminMe();
  const queryClient = useQueryClient();
  const errorMessage = useErrorMessage();
  const key = ['complaint', id];
  const complaint = useQuery({
    queryKey: key,
    queryFn: () => api(adminGetComplaint, { params: { complaintId: id } }),
  });
  const done = (data: AdminComplaint) => {
    queryClient.setQueryData(key, data);
    void queryClient.invalidateQueries({ queryKey: ['complaints'] });
  };
  const [body, setBody] = useState('');
  const [internal, setInternal] = useState(false);
  const reply = useMutation({
    meta: { toast: tt('sent') },
    mutationFn: () =>
      api(adminReplyToComplaint, { params: { complaintId: id }, body: { body, internal } }),
    onSuccess: (data) => {
      setBody('');
      setInternal(false);
      done(data);
    },
  });
  const update = useMutation({
    meta: { toast: tt('updated') },
    mutationFn: (patch: { status?: ComplaintStatus; assigneeId?: string | null }) =>
      api(adminUpdateComplaint, { params: { complaintId: id }, body: patch }),
    onSuccess: done,
  });
  const handle = can('complaints.handle');

  if (complaint.isError) return <Alert tone="error">{errorMessage(complaint.error)}</Alert>;
  if (!complaint.data) return <DetailSkeleton label={tc('loading')} />;
  const c = complaint.data;

  return (
    <Card data-testid="complaint-detail">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-display text-xl">
          <Ltr>{c.reference}</Ltr>
        </h2>
        <Badge>{t(`statuses.${c.status}`)}</Badge>
      </div>
      <p className="mt-1 text-sm text-ink-muted">
        {t(`categories.${c.category}`)} · {t(`kinds.${c.reporterKind}`)} · {c.reporter.name ?? '-'}{' '}
        {c.reporter.phone ? <Ltr>{displayPhone(c.reporter.phone)}</Ltr> : null}
        {c.venue ? ` · ${pick(c.venue.name, locale)}` : ''}
        {c.bookingReference ? (
          <>
            {' · '}
            <Ltr>{c.bookingReference}</Ltr>
          </>
        ) : null}
      </p>
      <p className="mt-1 text-sm">
        {t('assignedTo', { name: c.assignee?.name ?? t('unassigned') })}
      </p>
      <p className="mt-4 whitespace-pre-wrap rounded-lg bg-canvas p-3">{c.body}</p>
      <ul className="mt-4 flex flex-col gap-2">
        {c.messages.map((m) => (
          <li
            key={m.id}
            className={cx(
              'rounded-lg p-3 text-sm',
              m.internal
                ? 'bg-canvas-deep italic'
                : m.authorKind === 'staff'
                  ? 'bg-brand-50'
                  : 'bg-canvas',
            )}
          >
            <p className="text-xs text-ink-muted">
              {m.internal ? `${t('internal')} · ` : ''}
              {m.authorName ?? '-'} ·{' '}
              {format.dateTime(new Date(m.createdAt), { dateStyle: 'short', timeStyle: 'short' })}
            </p>
            <p className="whitespace-pre-wrap">{m.body}</p>
          </li>
        ))}
      </ul>
      {reply.isError || update.isError ? (
        <Alert tone="error" className="mt-3">
          {errorMessage(reply.error ?? update.error)}
        </Alert>
      ) : null}
      {handle ? (
        <>
          <form
            className="mt-4 flex flex-col gap-3"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              if (body.trim()) reply.mutate();
            }}
          >
            <TextAreaField
              label={t('reply')}
              rows={3}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              name="complaintReply"
            />
            <CheckboxField
              label={t('internalNote')}
              checked={internal}
              onChange={(e) => setInternal(e.target.checked)}
            />
            <div>
              <Button type="submit" busy={reply.isPending} disabled={!body.trim()}>
                {t('send')}
              </Button>
            </div>
          </form>
          <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
            {c.assignee?.id !== me.data?.id ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => update.mutate({ assigneeId: me.data?.id ?? null })}
              >
                {t('assignMe')}
              </Button>
            ) : (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => update.mutate({ assigneeId: null })}
              >
                {t('unassign')}
              </Button>
            )}
            {STATUSES.filter((s) => s !== c.status).map((s) => (
              <Button
                key={s}
                size="sm"
                variant="secondary"
                onClick={() => update.mutate({ status: s })}
              >
                {t(`moveTo.${s}`)}
              </Button>
            ))}
          </div>
        </>
      ) : null}
    </Card>
  );
}
