'use client';

import {
  addVenueTeamMember,
  changeVenueTeamRole,
  listVenueTeam,
  removeVenueTeamMember,
  type MembershipRole,
} from '@jordan-sports/contracts/web';
import {
  Alert,
  Badge,
  Button,
  Card,
  CheckboxField,
  ListSkeleton,
  Ltr,
  SelectField,
  TextField,
} from '@jordan-sports/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { displayPhone } from '@/lib/format';
import { useApi } from '@/lib/api';
import { useErrorMessage } from '@/lib/use-error-message';

/** Least power first: front-desk staff is the default for new people. */
const ROLES: MembershipRole[] = ['staff', 'manager', 'owner'];

/** Venue owner: who works with them and what each can do. */
export function TeamPanel({ venueId }: { venueId: string }) {
  const t = useTranslations('web.manage.team');
  const tr = useTranslations('common.roles');
  const tc = useTranslations('common');
  const api = useApi();
  const queryClient = useQueryClient();
  const errorMessage = useErrorMessage();
  const key = ['venue-team', venueId];
  const team = useQuery({
    queryKey: key,
    queryFn: () => api(listVenueTeam, { params: { venueId } }),
  });
  const empty = {
    phone: '',
    displayName: '',
    role: 'staff' as MembershipRole,
    confirmOwner: false,
  };
  const [form, setForm] = useState(empty);
  const add = useMutation({
    mutationFn: () => api(addVenueTeamMember, { params: { venueId }, body: form }),
    meta: { toast: tc('toast.added') },
    onSuccess: (data) => {
      queryClient.setQueryData(key, data);
      setForm(empty);
    },
  });
  const change = useMutation({
    mutationFn: (v: { memberId: string; role: MembershipRole }) =>
      api(changeVenueTeamRole, {
        params: { memberId: v.memberId },
        body: { role: v.role, confirmOwner: v.role === 'owner' },
      }),
    meta: { toast: tc('toast.updated') },
    onSuccess: (data) => queryClient.setQueryData(key, data),
  });
  const remove = useMutation({
    mutationFn: (memberId: string) => api(removeVenueTeamMember, { params: { memberId } }),
    meta: { toast: tc('toast.removed') },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });
  const error = add.error ?? change.error ?? remove.error;

  if (team.isPending) return <ListSkeleton label={tc('loading')} rows={2} />;
  if (team.isError) return <Alert tone="error">{errorMessage(team.error)}</Alert>;

  return (
    <div className="flex flex-col gap-4" data-testid="team-panel">
      <p className="text-ink-muted">{t('intro')}</p>
      <ul className="text-sm text-ink-muted">
        {ROLES.map((r) => (
          <li key={r}>
            <strong className="text-ink">{tr(r)}:</strong> {t(`roleHelp.${r}`)}
          </li>
        ))}
      </ul>
      {error ? <Alert tone="error">{errorMessage(error)}</Alert> : null}
      <Card>
        <ul className="divide-y divide-line">
          {team.data.members.map((m) => (
            <li key={m.memberId} className="flex flex-wrap items-end justify-between gap-3 py-3">
              <div>
                <p className="font-medium">
                  {m.displayName ?? '-'} {m.isYou ? <Badge>{t('you')}</Badge> : null}
                </p>
                {m.phone ? (
                  <p className="text-sm text-ink-muted">
                    <Ltr>{displayPhone(m.phone)}</Ltr>
                  </p>
                ) : null}
              </div>
              {m.isYou ? (
                <Badge>{tr(m.role)}</Badge>
              ) : (
                <div className="flex flex-wrap items-end gap-2">
                  <SelectField
                    label={t('role')}
                    value={m.role}
                    onChange={(e) =>
                      (e.target.value !== 'owner' ||
                        window.confirm(t('ownerConfirmPrompt', { name: m.displayName ?? '' }))) &&
                      change.mutate({
                        memberId: m.memberId,
                        role: e.target.value as MembershipRole,
                      })
                    }
                    name={`role-${m.memberId}`}
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {tr(r)}
                      </option>
                    ))}
                  </SelectField>
                  <Button
                    size="sm"
                    variant="secondary"
                    busy={remove.isPending && remove.variables === m.memberId}
                    onClick={() => {
                      if (window.confirm(t('removeConfirm', { name: m.displayName ?? '' }))) {
                        remove.mutate(m.memberId);
                      }
                    }}
                  >
                    {t('remove')}
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </Card>
      <Card>
        <h2 className="mb-3 font-display text-2xl">{t('addTitle')}</h2>
        <form
          className="grid items-end gap-3 sm:grid-cols-4"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            add.mutate();
          }}
        >
          <TextField
            label={t('phone')}
            inputMode="tel"
            dir="ltr"
            required
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            name="memberPhone"
          />
          <TextField
            label={t('name')}
            required
            value={form.displayName}
            onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
            name="memberName"
          />
          <SelectField
            label={t('role')}
            value={form.role}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                role: e.target.value as MembershipRole,
                confirmOwner: false,
              }))
            }
            name="memberRole"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {tr(r)}
              </option>
            ))}
          </SelectField>
          <Button
            type="submit"
            busy={add.isPending}
            disabled={form.role === 'owner' && !form.confirmOwner}
          >
            {t('add')}
          </Button>
          {form.role === 'owner' ? (
            <div className="sm:col-span-4" data-testid="owner-confirm">
              <Alert tone="warning">{t('ownerWarning')}</Alert>
              <CheckboxField
                label={t('ownerConfirm')}
                checked={form.confirmOwner}
                onChange={(e) => setForm((f) => ({ ...f, confirmOwner: e.target.checked }))}
                name="confirmOwner"
              />
            </div>
          ) : null}
        </form>
        <p className="mt-3 text-sm text-ink-muted">{t('addHint')}</p>
      </Card>
    </div>
  );
}
