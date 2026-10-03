'use client';

import {
  adminAddMember,
  adminCreateOrganization,
  adminGetOrganization,
  adminListOrganizations,
  type MembershipRole,
} from '@jordan-sports/contracts/web';
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
import { useState, type FormEvent } from 'react';
import { Link } from '@/i18n/navigation';
import { useApi } from '@/lib/api';
import { dmyTime, displayPhone } from '@/lib/format';
import { pick } from '@/lib/localized';
import { useErrorMessage } from '@/lib/use-error-message';
import { VenueList } from './venues/venue-list';

export function OrganizationsPage() {
  const t = useTranslations('admin.organizations');
  const tc = useTranslations('common');
  const locale = useLocale();
  const api = useApi();
  const errorMessage = useErrorMessage();
  const [showCreate, setShowCreate] = useState(false);
  const list = useQuery({
    queryKey: ['organizations'],
    queryFn: () => api(adminListOrganizations, { query: { limit: 100 } }),
  });

  return (
    <>
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          <Button onClick={() => setShowCreate((v) => !v)} aria-expanded={showCreate}>
            {t('create')}
          </Button>
        }
      />
      {showCreate ? <CreateOrganizationForm onDone={() => setShowCreate(false)} /> : null}
      {list.isPending ? <ListSkeleton label={tc('loading')} rows={4} /> : null}
      {list.isError ? <Alert tone="error">{errorMessage(list.error)}</Alert> : null}
      {list.data ? (
        list.data.items.length === 0 ? (
          <p className="text-ink-muted">{tc('empty')}</p>
        ) : (
          <Card className="p-0">
            <ul className="divide-y divide-line">
              {list.data.items.map((org) => (
                <li key={org.id}>
                  <Link
                    href={`/organizations/${org.id}`}
                    className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 hover:bg-canvas"
                  >
                    <span>
                      <span className="block font-medium">{pick(org.name, locale)}</span>
                      <span className="text-sm text-ink-muted" dir="ltr">
                        {org.slug}
                      </span>
                    </span>
                    <span className="flex items-center gap-3 text-sm text-ink-muted">
                      <Badge>{t(`statuses.${org.status}`)}</Badge>
                      {dmyTime(new Date(org.createdAt)).slice(0, 10)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )
      ) : null}
    </>
  );
}

function CreateOrganizationForm({ onDone }: { onDone: () => void }) {
  const t = useTranslations('admin.organizations');
  const tt = useTranslations('common.toast');
  const tc = useTranslations('common.actions');
  const api = useApi();
  const queryClient = useQueryClient();
  const errorMessage = useErrorMessage();
  const [form, setForm] = useState({
    slug: '',
    nameAr: '',
    nameEn: '',
    ownerPhone: '',
    ownerName: '',
  });
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const create = useMutation({
    meta: { toast: tt('added') },
    mutationFn: () =>
      api(adminCreateOrganization, {
        body: {
          slug: form.slug.trim(),
          name: {
            ...(form.nameAr.trim() ? { ar: form.nameAr } : {}),
            ...(form.nameEn.trim() ? { en: form.nameEn } : {}),
          },
          owner: { phone: form.ownerPhone, displayName: form.ownerName },
        },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['organizations'] });
      onDone();
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate();
  };

  return (
    <Card className="mb-6">
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <h2 className="font-display text-2xl leading-[1.35] sm:col-span-2">{t('createTitle')}</h2>
        {create.isError ? (
          <Alert tone="error" className="sm:col-span-2">
            {errorMessage(create.error)}
          </Alert>
        ) : null}
        <TextField
          label={t('nameAr')}
          value={form.nameAr}
          onChange={set('nameAr')}
          dir="rtl"
          lang="ar"
          name="nameAr"
        />
        <TextField
          label={t('nameEn')}
          value={form.nameEn}
          onChange={set('nameEn')}
          dir="ltr"
          lang="en"
          name="nameEn"
        />
        <TextField
          label={t('slug')}
          hint={t('slugHint')}
          value={form.slug}
          onChange={set('slug')}
          dir="ltr"
          required
          name="slug"
        />
        <div className="hidden sm:block" />
        <TextField
          label={t('ownerName')}
          value={form.ownerName}
          onChange={set('ownerName')}
          required
          name="ownerName"
        />
        <TextField
          label={t('ownerPhone')}
          value={form.ownerPhone}
          onChange={set('ownerPhone')}
          type="tel"
          dir="ltr"
          required
          name="ownerPhone"
        />
        <div className="flex gap-2 sm:col-span-2">
          <Button type="submit" busy={create.isPending}>
            {tc('create')}
          </Button>
          <Button variant="secondary" onClick={onDone}>
            {tc('cancel')}
          </Button>
        </div>
      </form>
    </Card>
  );
}

export function OrganizationDetailPage({ organizationId }: { organizationId: string }) {
  const t = useTranslations('admin.organizations');
  const tc = useTranslations('common');
  const locale = useLocale();
  const api = useApi();
  const queryClient = useQueryClient();
  const errorMessage = useErrorMessage();
  const org = useQuery({
    queryKey: ['organization', organizationId],
    queryFn: () => api(adminGetOrganization, { params: { organizationId } }),
  });
  const [member, setMember] = useState<{
    phone: string;
    displayName: string;
    role: MembershipRole;
  }>({
    phone: '',
    displayName: '',
    role: 'staff',
  });
  const add = useMutation({
    meta: { toast: t('memberAdded') },
    mutationFn: () => api(adminAddMember, { params: { organizationId }, body: member }),
    onSuccess: (data) => {
      queryClient.setQueryData(['organization', organizationId], data);
      setMember({ phone: '', displayName: '', role: 'staff' });
    },
  });

  if (org.isPending) return <DetailSkeleton label={tc('loading')} />;
  if (org.isError) return <Alert tone="error">{errorMessage(org.error)}</Alert>;

  return (
    <>
      <PageHeader title={pick(org.data.name, locale)} description={org.data.slug} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="font-display text-2xl leading-[1.35]">{t('members')}</h2>
          <ul className="mt-3 divide-y divide-line">
            {org.data.members.map((m) => (
              <li key={m.userId} className="flex items-center justify-between gap-3 py-3">
                <span>
                  <span className="block font-medium">{m.displayName}</span>
                  {m.phone ? (
                    <span className="text-sm text-ink-muted">
                      <Ltr>{displayPhone(m.phone)}</Ltr>
                    </span>
                  ) : null}
                </span>
                <Badge>{tc(`roles.${m.role}`)}</Badge>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              add.mutate();
            }}
            className="flex flex-col gap-4"
          >
            <h2 className="font-display text-2xl leading-[1.35]">{t('addMember')}</h2>
            {add.isError ? <Alert tone="error">{errorMessage(add.error)}</Alert> : null}
            <TextField
              label={t('memberName')}
              value={member.displayName}
              onChange={(e) => setMember((m) => ({ ...m, displayName: e.target.value }))}
              required
              name="memberName"
            />
            <TextField
              label={t('memberPhone')}
              value={member.phone}
              onChange={(e) => setMember((m) => ({ ...m, phone: e.target.value }))}
              type="tel"
              dir="ltr"
              required
              name="memberPhone"
            />
            <SelectField
              label={t('memberRole')}
              value={member.role}
              onChange={(e) => setMember((m) => ({ ...m, role: e.target.value as MembershipRole }))}
              name="memberRole"
            >
              {(['owner', 'manager', 'staff'] as const).map((r) => (
                <option key={r} value={r}>
                  {tc(`roles.${r}`)}
                </option>
              ))}
            </SelectField>
            <Button type="submit" busy={add.isPending}>
              {t('addMember')}
            </Button>
          </form>
        </Card>
        <div className="lg:col-span-2">
          <VenueList organizationId={organizationId} />
        </div>
      </div>
    </>
  );
}
