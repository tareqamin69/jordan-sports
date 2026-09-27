'use client';

import { adminListUsers, adminSetUserStatus, type AdminUser } from '@jordan-sports/contracts';
import { Alert, Badge, Button, Card, Ltr, PageHeader, Spinner, TextField } from '@jordan-sports/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useApi } from '@/lib/api';
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
      {users.isPending ? <Spinner label={tc('loading')} /> : null}
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
  const tc = useTranslations('common.actions');
  const api = useApi();
  const queryClient = useQueryClient();
  const errorMessage = useErrorMessage();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const next = user.status === 'active' ? 'suspended' : 'active';
  const change = useMutation({
    mutationFn: () =>
      api(adminSetUserStatus, { params: { userId: user.id }, body: { status: next, reason } }),
    onSuccess: async () => {
      setOpen(false);
      setReason('');
      await queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });

  return (
    <li className="px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-medium">{user.displayName ?? '—'}</p>
          <p className="text-sm text-ink-muted">
            <Ltr>{user.phone ?? user.email}</Ltr>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge>{t(`statuses.${user.status}`)}</Badge>
          {user.platformRole ? <Badge>{user.platformRole}</Badge> : null}
          <Button
            size="sm"
            variant={next === 'suspended' ? 'danger' : 'secondary'}
            onClick={() => setOpen((v) => !v)}
          >
            {next === 'suspended' ? t('suspend') : t('reactivate')}
          </Button>
        </div>
      </div>
      {open ? (
        <form
          className="mt-4 flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            change.mutate();
          }}
        >
          {change.isError ? <Alert tone="error">{errorMessage(change.error)}</Alert> : null}
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
              variant={next === 'suspended' ? 'danger' : 'primary'}
              busy={change.isPending}
            >
              {t('confirm')}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setOpen(false)}>
              {tc('cancel')}
            </Button>
          </div>
        </form>
      ) : null}
    </li>
  );
}
