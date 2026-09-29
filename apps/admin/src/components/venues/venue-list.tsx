'use client';

import { adminCreateVenue, adminListVenues } from '@jordan-sports/contracts';
import { Alert, Badge, Button, Card, SelectField, TextField } from '@jordan-sports/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import { useApi } from '@/lib/api';
import { useCatalog } from '@/lib/catalog';
import { pick } from '@/lib/localized';
import { useErrorMessage } from '@/lib/use-error-message';

export function VenueList({ organizationId }: { organizationId: string }) {
  const t = useTranslations('admin.venues');
  const locale = useLocale();
  const api = useApi();
  const [creating, setCreating] = useState(false);
  const venues = useQuery({
    queryKey: ['org-venues', organizationId],
    queryFn: () => api(adminListVenues, { params: { organizationId } }),
  });

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-2xl leading-tight">{t('title')}</h2>
        <Button size="sm" onClick={() => setCreating((v) => !v)} aria-expanded={creating}>
          {t('create')}
        </Button>
      </div>
      {creating ? <CreateVenueForm organizationId={organizationId} /> : null}
      {venues.data && venues.data.items.length === 0 ? (
        <p className="mt-3 text-ink-muted">{t('empty')}</p>
      ) : null}
      <ul className="mt-3 divide-y divide-line">
        {venues.data?.items.map((v) => (
          <li key={v.id}>
            <Link
              href={`/venues/${v.id}`}
              className="flex flex-wrap items-center justify-between gap-3 py-3 hover:bg-canvas"
            >
              <span className="font-medium">{pick(v.name, locale)}</span>
              <span className="flex items-center gap-2 text-sm text-ink-muted">
                {t('resourceCount', { count: v.resourceCount })}
                <Badge>{t(`statuses.${v.status}`)}</Badge>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function CreateVenueForm({ organizationId }: { organizationId: string }) {
  const t = useTranslations('admin');
  const tc = useTranslations('common.actions');
  const locale = useLocale();
  const api = useApi();
  const router = useRouter();
  const catalog = useCatalog();
  const errorMessage = useErrorMessage();
  const [form, setForm] = useState({
    slug: '',
    nameAr: '',
    nameEn: '',
    governorateId: '',
    areaId: '',
  });
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));
  const governorates = catalog.data?.governorates ?? [];
  const governorateId = form.governorateId || governorates[0]?.id || '';
  const areas = governorates.find((g) => g.id === governorateId)?.areas ?? [];

  const create = useMutation({
    mutationFn: () =>
      api(adminCreateVenue, {
        params: { organizationId },
        body: {
          slug: form.slug.trim(),
          name: {
            ...(form.nameAr.trim() ? { ar: form.nameAr } : {}),
            ...(form.nameEn.trim() ? { en: form.nameEn } : {}),
          },
          governorateId,
          areaId: form.areaId || null,
          amenityIds: [],
        },
      }),
    onSuccess: (venue) => router.push(`/venues/${venue.id}`),
  });

  return (
    <form
      className="mt-4 grid gap-4 border-t border-line pt-4 sm:grid-cols-2"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        create.mutate();
      }}
    >
      <h3 className="font-bold sm:col-span-2">{t('venues.createTitle')}</h3>
      {create.isError ? (
        <Alert tone="error" className="sm:col-span-2">
          {errorMessage(create.error)}
        </Alert>
      ) : null}
      <TextField
        label={t('organizations.nameAr')}
        value={form.nameAr}
        onChange={set('nameAr')}
        dir="rtl"
        lang="ar"
        name="venueNameAr"
      />
      <TextField
        label={t('organizations.nameEn')}
        value={form.nameEn}
        onChange={set('nameEn')}
        dir="ltr"
        lang="en"
        name="venueNameEn"
      />
      <TextField
        label={t('organizations.slug')}
        hint={t('organizations.slugHint')}
        value={form.slug}
        onChange={set('slug')}
        dir="ltr"
        required
        name="venueSlug"
      />
      <SelectField
        label={t('venues.governorate')}
        value={governorateId}
        onChange={(e) => setForm((f) => ({ ...f, governorateId: e.target.value, areaId: '' }))}
        name="governorateId"
      >
        {governorates.map((g) => (
          <option key={g.id} value={g.id}>
            {pick(g.name, locale)}
          </option>
        ))}
      </SelectField>
      <SelectField
        label={t('venues.area')}
        value={form.areaId}
        onChange={set('areaId')}
        name="areaId"
      >
        <option value="">{t('venues.noArea')}</option>
        {areas.map((a) => (
          <option key={a.id} value={a.id}>
            {pick(a.name, locale)}
          </option>
        ))}
      </SelectField>
      <div className="sm:col-span-2">
        <Button type="submit" busy={create.isPending}>
          {tc('create')}
        </Button>
      </div>
    </form>
  );
}
