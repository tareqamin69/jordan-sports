'use client';

import {
  adminChangeStaffRole,
  adminGetTeam,
  adminInviteStaff,
  adminRemoveStaff,
  adminRevokeInvitation,
  type StaffRole,
  type TeamMember,
} from '@jordan-sports/contracts';
import {
  Alert,
  Badge,
  Button,
  Card,
  Ltr,
  PageHeader,
  SectionHeading,
  SelectField,
  Spinner,
  TextField,
} from '@jordan-sports/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { useAdminMe } from '@/lib/admin-session';
import { useApi } from '@/lib/api';
import { useErrorMessage } from '@/lib/use-error-message';

const STAFF_ROLES: StaffRole[] = ['admin', 'support', 'finance'];

/** Owner only: platform staff, their roles, and invitations by one-time link. */
export function TeamPage() {
  const t = useTranslations('admin.team');
  const tr = useTranslations('admin.roles');
  const tc = useTranslations('common');
  const format = useFormatter();
  const locale = useLocale();
  const api = useApi();
  const me = useAdminMe();
  const queryClient = useQueryClient();
  const errorMessage = useErrorMessage();
  const team = useQuery({ queryKey: ['team'], queryFn: () => api(adminGetTeam) });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['team'] });

  const [invite, setInvite] = useState({
    email: '',
    displayName: '',
    role: 'support' as StaffRole,
  });
  const [link, setLink] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: () =>
      api(adminInviteStaff, {
        body: {
          email: invite.email,
          role: invite.role,
          ...(invite.displayName.trim() ? { displayName: invite.displayName.trim() } : {}),
        },
      }),
    onSuccess: (data) => {
      setLink(`${window.location.origin}/${locale}/setup#token=${data.token}`);
      setInvite({ email: '', displayName: '', role: 'support' });
      void refresh();
    },
  });
  const revoke = useMutation({
    mutationFn: (invitationId: string) => api(adminRevokeInvitation, { params: { invitationId } }),
    onSuccess: refresh,
  });
  const changeRole = useMutation({
    mutationFn: (v: { userId: string; role: StaffRole }) =>
      api(adminChangeStaffRole, { params: { userId: v.userId }, body: { role: v.role } }),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (userId: string) => api(adminRemoveStaff, { params: { userId } }),
    onSuccess: refresh,
  });
  const error = create.error ?? revoke.error ?? changeRole.error ?? remove.error;

  if (team.isError) return <Alert tone="error">{errorMessage(team.error)}</Alert>;
  if (!team.data) return <Spinner label={tc('loading')} />;

  const editable = (m: TeamMember) => m.platformRole !== 'owner' && m.id !== me.data?.id;

  return (
    <>
      <PageHeader title={t('title')} description={t('description')} />
      {error ? (
        <Alert tone="error" className="mb-4">
          {errorMessage(error)}
        </Alert>
      ) : null}

      <Card className="mb-6">
        <SectionHeading title={t('inviteTitle')} />
        <form
          className="mt-4 grid items-end gap-4 sm:grid-cols-4"
          data-testid="invite-form"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            setLink(null);
            create.mutate();
          }}
        >
          <TextField
            label={t('email')}
            type="email"
            dir="ltr"
            required
            value={invite.email}
            onChange={(e) => setInvite((v) => ({ ...v, email: e.target.value }))}
            name="inviteEmail"
          />
          <TextField
            label={t('name')}
            value={invite.displayName}
            onChange={(e) => setInvite((v) => ({ ...v, displayName: e.target.value }))}
            name="inviteName"
          />
          <SelectField
            label={t('role')}
            value={invite.role}
            onChange={(e) => setInvite((v) => ({ ...v, role: e.target.value as StaffRole }))}
            name="inviteRole"
          >
            {STAFF_ROLES.map((r) => (
              <option key={r} value={r}>
                {tr(r)}
              </option>
            ))}
          </SelectField>
          <Button type="submit" busy={create.isPending}>
            {t('invite')}
          </Button>
        </form>
        {link ? (
          <Alert tone="success" className="mt-4" data-testid="invite-link">
            <p className="mb-2">{t('linkReady')}</p>
            <code dir="ltr" className="block break-all text-sm">
              {link}
            </code>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="mt-2"
              onClick={() => void navigator.clipboard?.writeText(link)}
            >
              {t('copy')}
            </Button>
          </Alert>
        ) : null}
      </Card>

      {team.data.invitations.length > 0 ? (
        <Card className="mb-6">
          <SectionHeading title={t('pending')} />
          <ul className="mt-3 divide-y divide-line">
            {team.data.invitations.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <Ltr>{i.email}</Ltr> · {tr(i.platformRole)}
                  <p className="text-xs text-ink-muted">
                    {t('expires', {
                      time: format.dateTime(new Date(i.expiresAt), {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      }),
                    })}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  busy={revoke.isPending && revoke.variables === i.id}
                  onClick={() => revoke.mutate(i.id)}
                >
                  {t('cancelInvite')}
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card>
        <SectionHeading title={t('members')} />
        <ul className="mt-3 divide-y divide-line" data-testid="team-members">
          {team.data.members.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="font-medium">
                  {m.displayName ?? '—'} {m.lockedUntil ? <Badge>{t('locked')}</Badge> : null}
                </p>
                <p className="text-sm text-ink-muted">
                  <Ltr>{m.email}</Ltr>
                  {m.lastActiveAt
                    ? ` · ${t('lastActive', {
                        time: format.dateTime(new Date(m.lastActiveAt), {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        }),
                      })}`
                    : ''}
                </p>
              </div>
              {editable(m) ? (
                <div className="flex flex-wrap items-end gap-2">
                  <SelectField
                    label={t('role')}
                    value={m.platformRole}
                    onChange={(e) =>
                      changeRole.mutate({ userId: m.id, role: e.target.value as StaffRole })
                    }
                    name={`role-${m.id}`}
                  >
                    {STAFF_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {tr(r)}
                      </option>
                    ))}
                  </SelectField>
                  <Button
                    size="sm"
                    variant="secondary"
                    busy={remove.isPending && remove.variables === m.id}
                    onClick={() => {
                      if (window.confirm(t('removeConfirm', { email: m.email }))) {
                        remove.mutate(m.id);
                      }
                    }}
                  >
                    {t('remove')}
                  </Button>
                </div>
              ) : (
                <Badge>{tr(m.platformRole)}</Badge>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
