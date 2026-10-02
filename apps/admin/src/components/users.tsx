'use client';

import {
  adminExportUserData,
  adminGetUser,
  adminListUsers,
  adminSetUserStatus,
  type AdminUser,
} from '@jordan-sports/contracts';
import {
  Alert,
  Badge,
  Button,
  Card,
  DetailSkeleton,
  ListSkeleton,
  Ltr,
  PageHeader,
  SelectField,
  TextField,
} from '@jordan-sports/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Link } from '@/i18n/navigation';
import { useCan } from '@/lib/admin-session';
import { displayPhone } from '@/lib/format';
import { useApi } from '@/lib/api';
import { pick } from '@/lib/localized';
import { useErrorMessage } from '@/lib/use-error-message';

export function UsersPage() {
  const t = useTranslations('admin.users');
  const tc = useTranslations('common');
  const api = useApi();
  const errorMessage = useErrorMessage();
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const users = useQuery({
    queryKey: ['users', q],
    queryFn: () => api(adminListUsers, { query: { limit: 50, ...(q ? { q } : {}) } }),
  });

  return (
    <>
      <PageHeader title={t('title')} />
      <form
        className="mb-6 flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setQ(search.trim());
        }}
      >
        <div className="flex-1">
          <TextField
            label={t('searchLabel')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            type="search"
            name="q"
          />
        </div>
        <Button type="submit" variant="secondary">
          {tc('actions.search')}
        </Button>
      </form>
      {users.isPending ? <ListSkeleton label={tc('loading')} rows={5} /> : null}
      {users.isError ? <Alert tone="error">{errorMessage(users.error)}</Alert> : null}
      {users.data ? (
        <Card className="p-0">
          <ul className="divide-y divide-line">
            {users.data.items.map((u) => (
              <UserRow key={u.id} user={u} />
            ))}
          </ul>
          {users.data.items.length === 0 ? (
            <p className="p-5 text-ink-muted">{tc('empty')}</p>
          ) : null}
        </Card>
      ) : null}
    </>
  );
}

function UserRow({ user }: { user: AdminUser }) {
  const t = useTranslations('admin.users');
  const tr = useTranslations('admin.roles');
  const tt = useTranslations('common.toast');
  const tc = useTranslations('common.actions');
  const api = useApi();
  const can = useCan();
  const queryClient = useQueryClient();
  const errorMessage = useErrorMessage();
  const [open, setOpen] = useState<null | 'status' | 'details'>(null);
  const [reason, setReason] = useState('');
  const [next, setNext] = useState<'active' | 'suspended' | 'banned'>(
    user.status === 'active' ? 'suspended' : 'active',
  );
  const change = useMutation({
    meta: { toast: tt('updated') },
    mutationFn: () =>
      api(adminSetUserStatus, { params: { userId: user.id }, body: { status: next, reason } }),
    onSuccess: async () => {
      setOpen(null);
      setReason('');
      await queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });
  // Staff accounts are managed by the owner from the team page.
  const manageable = can('users.manage') && !user.platformRole && user.status !== 'deleted';

  return (
    <li className="px-5 py-4" data-testid="admin-user">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-medium">{user.displayName ?? '-'}</p>
          <p className="text-sm text-ink-muted">
            <Ltr>{user.phone ? displayPhone(user.phone) : user.email}</Ltr>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge>{t(`statuses.${user.status}`)}</Badge>
          {user.platformRole ? <Badge>{tr(user.platformRole)}</Badge> : null}
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setOpen((v) => (v === 'details' ? null : 'details'))}
          >
            {t('details')}
          </Button>
          {manageable ? (
            <Button
              size="sm"
              // Opens a confirm step with a reason; no need to shout on every row.
              variant={user.status === 'active' ? 'ghostDanger' : 'secondary'}
              onClick={() => setOpen((v) => (v === 'status' ? null : 'status'))}
            >
              {user.status === 'active' ? t('suspend') : t('reactivate')}
            </Button>
          ) : null}
        </div>
      </div>
      {open === 'details' ? <UserDetails userId={user.id} /> : null}
      {open === 'status' ? (
        <form
          className="mt-4 flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            change.mutate();
          }}
        >
          {change.isError ? <Alert tone="error">{errorMessage(change.error)}</Alert> : null}
          <SelectField
            label={t('newStatus')}
            value={next}
            onChange={(e) => setNext(e.target.value as typeof next)}
            name="newStatus"
          >
            {(['active', 'suspended', 'banned'] as const)
              .filter((s) => s !== user.status)
              .map((s) => (
                <option key={s} value={s}>
                  {t(`statuses.${s}`)}
                </option>
              ))}
          </SelectField>
          <TextField
            label={t('reasonLabel')}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
            minLength={3}
            name="reason"
          />
          <div className="flex gap-2">
            <Button
              type="submit"
              size="sm"
              variant={next === 'active' ? 'primary' : 'danger'}
              busy={change.isPending}
            >
              {t('confirm')}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setOpen(null)}>
              {tc('cancel')}
            </Button>
          </div>
        </form>
      ) : null}
    </li>
  );
}

function UserDetails({ userId }: { userId: string }) {
  const t = useTranslations('admin.users');
  const tc = useTranslations('common');
  const locale = useLocale();
  const api = useApi();
  const errorMessage = useErrorMessage();
  const can = useCan();
  // Access requests (PDPL): everything stored about this person, as a file. Audited by the API.
  const download = useMutation({
    mutationFn: () => api(adminExportUserData, { params: { userId } }),
    onSuccess: (data) => {
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
      );
      const a = document.createElement('a');
      a.href = url;
      a.download = `user-${userId}.json`;
      a.click();
      URL.revokeObjectURL(url);
    },
  });
  const user = useQuery({
    queryKey: ['user', userId],
    queryFn: () => api(adminGetUser, { params: { userId } }),
  });
  if (user.isError) return <Alert tone="error">{errorMessage(user.error)}</Alert>;
  if (!user.data) return <DetailSkeleton label={tc('loading')} />;
  const r = user.data.reliability;
  const tiles: Array<[string, string | number]> = [
    [t('reliability.bookings'), r.bookings],
    [t('reliability.kept'), r.keptPercent === null ? '-' : `${r.keptPercent}%`],
    [t('reliability.cancelled'), r.cancelled],
    [t('reliability.late'), r.lateCancellations],
    [t('reliability.noShows'), r.noShows],
    [t('reliability.complaints'), user.data.complaints],
  ];
  return (
    <div className="mt-4 flex flex-col gap-3" data-testid="user-details">
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-6">
        {tiles.map(([label, value]) => (
          <div key={label} className="rounded-lg bg-canvas p-2">
            <dt className="text-xs text-ink-muted">{label}</dt>
            <dd className="font-display text-lg tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      {user.data.memberships.length > 0 ? (
        <p className="text-sm">
          {t('memberships')}{' '}
          {user.data.memberships
            .map((m) => `${pick(m.organizationName, locale)} (${m.role})`)
            .join('، ')}
        </p>
      ) : null}
      <Link
        href={{ pathname: '/bookings', query: { user: userId } }}
        className="text-sm text-primary"
      >
        {t('bookingsLink')}
      </Link>
      {can('users.manage') ? (
        <div>
          {download.isError ? <Alert tone="error">{errorMessage(download.error)}</Alert> : null}
          <Button
            size="sm"
            variant="secondary"
            busy={download.isPending}
            onClick={() => download.mutate()}
          >
            {t('exportData')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
