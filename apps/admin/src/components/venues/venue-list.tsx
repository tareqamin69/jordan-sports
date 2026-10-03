'use client';

import {
  ApiError,
  adminCreateVenue,
  adminImportVenueFromMap,
  adminListVenues,
  type VenueImport,
} from '@jordan-sports/contracts/web';
import { Alert, Badge, Button, Card, EmptyState, SelectField, TextField } from '@jordan-sports/ui';
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
        <h2 className="font-display text-2xl leading-[1.35]">{t('title')}</h2>
        <Button size="sm" onClick={() => setCreating((v) => !v)} aria-expanded={creating}>
          {t('create')}
        </Button>
      </div>
      {creating ? <CreateVenueForm organizationId={organizationId} /> : null}
      {venues.data && venues.data.items.length === 0 ? (
        <EmptyState art="venues" title={t('empty')} className="mt-3" />
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
  const tt = useTranslations('common.toast');
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
  // Filled from a Google Maps link (pin, address, phone); sent with the new venue.
  const [imported, setImported] = useState<VenueImport | null>(null);
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));
  const governorates = catalog.data?.governorates ?? [];
  const governorateId = form.governorateId || governorates[0]?.id || '';
  const areas = governorates.find((g) => g.id === governorateId)?.areas ?? [];

  const create = useMutation({
    meta: { toast: tt('added') },
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
          ...(imported?.location ? { location: imported.location } : {}),
          ...(imported?.address ? { address: { ar: imported.address } } : {}),
          ...(imported?.phone ? { contactPhone: imported.phone } : {}),
        },
      }),
    onSuccess: (venue) => router.push(`/venues/${venue.id}`),
  });

  return (
    <div className="mt-4 flex flex-col gap-4 border-t border-line pt-4">
      <h3 className="font-bold">{t('venues.createTitle')}</h3>
      <MapImport
        onImported={(data) => {
          setImported(data);
          setForm((f) => ({
            ...f,
            nameAr: data.name ?? f.nameAr,
            governorateId: data.governorateId ?? f.governorateId,
            areaId: data.governorateId ? (data.areaId ?? '') : f.areaId,
          }));
        }}
      />
      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          create.mutate();
        }}
      >
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
    </div>
  );
}

/** Optional Google Maps link that pre-fills the new venue; any failure is a soft note only. */
function MapImport({ onImported }: { onImported: (data: VenueImport) => void }) {
  const t = useTranslations('admin.venues');
  const api = useApi();
  const errorMessage = useErrorMessage();
  const [url, setUrl] = useState('');
  const read = useMutation({
    mutationFn: () => api(adminImportVenueFromMap, { body: { url: url.trim() } }),
    onSuccess: onImported,
  });

  return (
    <form
      className="flex flex-col gap-3 rounded-card border border-dashed border-line p-4"
      data-testid="map-import"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        if (url.trim().length >= 8) read.mutate();
      }}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <TextField
            label={t('mapLink')}
            hint={t('mapLinkHint')}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            type="url"
            dir="ltr"
            name="mapLink"
          />
        </div>
        <Button
          type="submit"
          variant="secondary"
          busy={read.isPending}
          disabled={url.trim().length < 8}
          className="sm:mb-6"
        >
          {t('mapLinkRead')}
        </Button>
      </div>
      {read.isSuccess ? (
        <Alert tone="success" data-testid="map-import-done">
          {t('mapLinkDone')}
        </Alert>
      ) : null}
      {read.isError ? (
        <Alert tone="info">
          {read.error instanceof ApiError && read.error.code === 'MAP_LINK_UNREADABLE'
            ? errorMessage(read.error)
            : t('mapLinkFailed')}
        </Alert>
      ) : null}
    </form>
  );
}
