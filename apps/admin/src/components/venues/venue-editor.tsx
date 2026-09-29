'use client';

import {
  adminCreateFacility,
  adminCreateResource,
  adminDeleteVenueMedia,
  adminGetVenue,
  adminSetVenueStatus,
  adminUpdateResource,
  adminUpdateVenue,
  adminUploadVenueMedia,
  type AdminVenue,
  type Catalog,
  type VenueStatus,
} from '@jordan-sports/contracts';
import {
  Alert,
  Badge,
  Button,
  Card,
  CheckboxField,
  FormSkeleton,
  PageHeader,
  SelectField,
  TextAreaField,
  TextField,
} from '@jordan-sports/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { useApi } from '@/lib/api';
import { useCatalog } from '@/lib/catalog';
import { joinList, pick } from '@/lib/localized';
import { useErrorMessage } from '@/lib/use-error-message';
import { useCan } from '@/lib/admin-session';
import { ReviewSummary } from './review-summary';
import {
  VenueArchivePanel,
  VenueCommissionPanel,
  VenueRatingPanel,
  VenueStatsPanel,
} from './venue-oversight';

const transitions: Record<VenueStatus, VenueStatus[]> = {
  draft: ['approved', 'submitted', 'rejected'],
  submitted: ['approved', 'rejected', 'draft'],
  approved: ['suspended'],
  suspended: ['approved'],
  rejected: ['draft'],
};

type Localized = { ar?: string; en?: string };

function localized(ar: string, en: string): Localized | undefined {
  const value: Localized = {};
  if (ar.trim()) value.ar = ar.trim();
  if (en.trim()) value.en = en.trim();
  return value.ar || value.en ? value : undefined;
}

const hourLabel = (hour: number) => `${String(hour).padStart(2, '0')}:00`;

function useVenueMutation<T>(
  venueId: string,
  fn: (input: T) => Promise<AdminVenue>,
  toast?: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    meta: { toast },
    onSuccess: (venue) => queryClient.setQueryData(['venue', venueId], venue),
  });
}

export function VenueEditor({ venueId }: { venueId: string }) {
  const t = useTranslations('admin.venues');
  const tc = useTranslations('common');
  const locale = useLocale();
  const api = useApi();
  const errorMessage = useErrorMessage();
  const catalog = useCatalog();
  const can = useCan();
  const venue = useQuery({
    queryKey: ['venue', venueId],
    queryFn: () => api(adminGetVenue, { params: { venueId } }),
  });

  if (venue.isPending || catalog.isPending)
    return <FormSkeleton label={tc('loading')} fields={6} />;
  if (venue.isError) return <Alert tone="error">{errorMessage(venue.error)}</Alert>;
  if (catalog.isError) return <Alert tone="error">{errorMessage(catalog.error)}</Alert>;

  const v = venue.data;
  return (
    <>
      <PageHeader
        title={pick(v.name, locale)}
        description={v.slug}
        actions={<Badge data-testid="venue-status">{t(`statuses.${v.status}`)}</Badge>}
      />
      <div className="flex flex-col gap-6">
        <ReviewSummary venue={v} />
        {can('venues.review') ? <StatusPanel venue={v} /> : null}
        <VenueStatsPanel venue={v} />
        {can('venues.rate') ? <VenueRatingPanel venue={v} /> : null}
        {can('venues.edit') ? (
          <>
            <ProfileForm venue={v} catalog={catalog.data} />
            <ResourcesPanel venue={v} catalog={catalog.data} />
            <FacilitiesPanel venue={v} />
            <PhotosPanel venue={v} />
          </>
        ) : null}
        {can('finance.manage') ? <VenueCommissionPanel venue={v} /> : null}
        {can('venues.archive') ? <VenueArchivePanel venue={v} /> : null}
      </div>
    </>
  );
}

function StatusPanel({ venue }: { venue: AdminVenue }) {
  const t = useTranslations('admin.venues');
  const tt = useTranslations('common.toast');
  const api = useApi();
  const errorMessage = useErrorMessage();
  const [reason, setReason] = useState('');
  const change = useVenueMutation(
    venue.id,
    (status: VenueStatus) =>
      api(adminSetVenueStatus, { params: { venueId: venue.id }, body: { status, reason } }),
    tt('updated'),
  );
  // Sticky: the approve/reject buttons stay reachable while the reviewer scrolls the long form.
  return (
    <Card className="sticky bottom-3 z-10 shadow-lift" data-testid="status-bar">
      <div className="flex flex-col gap-3">
        {change.isError ? <Alert tone="error">{errorMessage(change.error)}</Alert> : null}
        <TextField
          label={t('statusReason')}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          name="statusReason"
        />
        <div className="flex flex-wrap gap-2">
          {transitions[venue.status].map((next) => (
            <Button
              key={next}
              size="sm"
              variant={
                next === 'approved'
                  ? 'primary'
                  : next === 'rejected' || next === 'suspended'
                    ? 'danger'
                    : 'secondary'
              }
              disabled={reason.trim().length < 3}
              busy={change.isPending && change.variables === next}
              onClick={() => change.mutate(next)}
            >
              {t(`actions.${next}`)}
            </Button>
          ))}
        </div>
      </div>
    </Card>
  );
}

function ProfileForm({ venue, catalog }: { venue: AdminVenue; catalog: Catalog }) {
  const t = useTranslations('admin');
  const tc = useTranslations('common.actions');
  const locale = useLocale();
  const api = useApi();
  const errorMessage = useErrorMessage();
  const [f, setF] = useState({
    nameAr: venue.name.ar ?? '',
    nameEn: venue.name.en ?? '',
    descriptionAr: venue.description.ar ?? '',
    descriptionEn: venue.description.en ?? '',
    addressAr: venue.address.ar ?? '',
    addressEn: venue.address.en ?? '',
    areaId: venue.areaId ?? '',
    contactPhone: venue.contactPhone ?? '',
    lat: venue.location ? String(venue.location.lat) : '',
    lng: venue.location ? String(venue.location.lng) : '',
    businessDayStartHour: String(Math.floor(venue.businessDayStartMinute / 60)),
    amenityIds: venue.amenityIds,
  });
  const set = (key: keyof typeof f) => (e: { target: { value: string } }) =>
    setF((s) => ({ ...s, [key]: e.target.value }));
  const areas = catalog.governorates.find((g) => g.id === venue.governorateId)?.areas ?? [];

  const save = useVenueMutation(
    venue.id,
    () => {
      const name = localized(f.nameAr, f.nameEn);
      const lat = Number(f.lat);
      const lng = Number(f.lng);
      return api(adminUpdateVenue, {
        params: { venueId: venue.id },
        body: {
          ...(name ? { name } : {}),
          ...(localized(f.descriptionAr, f.descriptionEn)
            ? { description: localized(f.descriptionAr, f.descriptionEn) }
            : {}),
          ...(localized(f.addressAr, f.addressEn)
            ? { address: localized(f.addressAr, f.addressEn) }
            : {}),
          areaId: f.areaId || null,
          contactPhone: f.contactPhone.trim() || null,
          location:
            f.lat.trim() && f.lng.trim() && Number.isFinite(lat) && Number.isFinite(lng)
              ? { lat, lng }
              : null,
          businessDayStartMinute: Number(f.businessDayStartHour) * 60,
          amenityIds: f.amenityIds,
        },
      });
    },
    t('venues.saved'),
  );

  return (
    <Card>
      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          save.mutate(undefined);
        }}
      >
        <h2 className="font-display text-2xl leading-tight sm:col-span-2">{t('venues.profile')}</h2>
        {save.isError ? (
          <Alert tone="error" className="sm:col-span-2">
            {errorMessage(save.error)}
          </Alert>
        ) : null}
        <TextField
          label={t('organizations.nameAr')}
          value={f.nameAr}
          onChange={set('nameAr')}
          dir="rtl"
          lang="ar"
        />
        <TextField
          label={t('organizations.nameEn')}
          value={f.nameEn}
          onChange={set('nameEn')}
          dir="ltr"
          lang="en"
        />
        <TextAreaField
          label={t('venues.descriptionAr')}
          value={f.descriptionAr}
          onChange={set('descriptionAr')}
          dir="rtl"
          lang="ar"
        />
        <TextAreaField
          label={t('venues.descriptionEn')}
          value={f.descriptionEn}
          onChange={set('descriptionEn')}
          dir="ltr"
          lang="en"
        />
        <TextField
          label={t('venues.addressAr')}
          value={f.addressAr}
          onChange={set('addressAr')}
          dir="rtl"
          lang="ar"
        />
        <TextField
          label={t('venues.addressEn')}
          value={f.addressEn}
          onChange={set('addressEn')}
          dir="ltr"
          lang="en"
        />
        <SelectField label={t('venues.area')} value={f.areaId} onChange={set('areaId')}>
          <option value="">{t('venues.noArea')}</option>
          {areas.map((a) => (
            <option key={a.id} value={a.id}>
              {pick(a.name, locale)}
            </option>
          ))}
        </SelectField>
        <TextField
          label={t('venues.contactPhone')}
          value={f.contactPhone}
          onChange={set('contactPhone')}
          type="tel"
          dir="ltr"
        />
        <TextField
          label={t('venues.latitude')}
          hint={t('venues.locationHint')}
          value={f.lat}
          onChange={set('lat')}
          inputMode="decimal"
          dir="ltr"
        />
        <TextField
          label={t('venues.longitude')}
          value={f.lng}
          onChange={set('lng')}
          inputMode="decimal"
          dir="ltr"
        />
        <SelectField
          label={t('venues.businessDayStart')}
          hint={t('venues.businessDayHint')}
          value={f.businessDayStartHour}
          onChange={set('businessDayStartHour')}
        >
          {Array.from({ length: 13 }, (_, h) => (
            <option key={h} value={h}>
              {hourLabel(h)}
            </option>
          ))}
        </SelectField>
        <fieldset className="sm:col-span-2">
          <legend className="mb-2 text-sm font-medium">{t('venues.amenities')}</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {catalog.amenities.map((a) => (
              <CheckboxField
                key={a.id}
                label={pick(a.name, locale)}
                checked={f.amenityIds.includes(a.id)}
                onChange={(e) =>
                  setF((s) => ({
                    ...s,
                    amenityIds: e.target.checked
                      ? [...s.amenityIds, a.id]
                      : s.amenityIds.filter((id) => id !== a.id),
                  }))
                }
              />
            ))}
          </div>
        </fieldset>
        <div className="sm:col-span-2">
          <Button type="submit" busy={save.isPending}>
            {tc('save')}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function ResourcesPanel({ venue, catalog }: { venue: AdminVenue; catalog: Catalog }) {
  const t = useTranslations('admin.venues');
  const tt = useTranslations('common.toast');
  const locale = useLocale();
  const api = useApi();
  const errorMessage = useErrorMessage();
  const [adding, setAdding] = useState(false);
  const toggle = useVenueMutation(
    venue.id,
    (input: { resourceId: string; status: 'active' | 'inactive' }) =>
      api(adminUpdateResource, {
        params: { resourceId: input.resourceId },
        body: { status: input.status },
      }),
    tt('updated'),
  );
  const nameOf = (id: string) => pick(venue.resources.find((r) => r.id === id)?.name, locale);

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-2xl leading-tight">{t('resources')}</h2>
        <Button size="sm" onClick={() => setAdding((v) => !v)} aria-expanded={adding}>
          {t('addResource')}
        </Button>
      </div>
      {toggle.isError ? (
        <Alert tone="error" className="mt-3">
          {errorMessage(toggle.error)}
        </Alert>
      ) : null}
      {adding ? (
        <AddResourceForm venue={venue} catalog={catalog} onDone={() => setAdding(false)} />
      ) : null}
      <ul className="mt-3 divide-y divide-line" data-testid="resource-list">
        {venue.resources.map((r) => (
          <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="font-medium">{pick(r.name, locale)}</p>
              <p className="text-sm text-ink-muted">
                {pick(r.type.name, locale)} ·{' '}
                {joinList(
                  r.formats.map((fm) => pick(fm.name, locale)),
                  locale,
                )}
              </p>
              {r.features.length > 0 ? (
                <p className="text-sm text-ink-muted">
                  {r.features
                    .map((fe) =>
                      fe.value
                        ? `${pick(fe.label, locale)}: ${pick(fe.value, locale)}`
                        : pick(fe.label, locale),
                    )
                    .join(' · ')}
                </p>
              ) : null}
              {r.overlapsWith.length > 0 ? (
                <p className="text-sm text-warning">
                  {t('overlaps', { names: joinList(r.overlapsWith.map(nameOf), locale) })}
                </p>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <Badge>{r.status === 'active' ? t('active') : t('inactive')}</Badge>
              <Button
                size="sm"
                variant="secondary"
                busy={toggle.isPending && toggle.variables?.resourceId === r.id}
                onClick={() =>
                  toggle.mutate({
                    resourceId: r.id,
                    status: r.status === 'active' ? 'inactive' : 'active',
                  })
                }
              >
                {r.status === 'active' ? t('deactivate') : t('activate')}
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function AddResourceForm({
  venue,
  catalog,
  onDone,
}: {
  venue: AdminVenue;
  catalog: Catalog;
  onDone: () => void;
}) {
  const t = useTranslations('admin.venues');
  const tt = useTranslations('common.toast');
  const tc = useTranslations('common.actions');
  const locale = useLocale();
  const api = useApi();
  const errorMessage = useErrorMessage();
  const [typeId, setTypeId] = useState(catalog.resourceTypes[0]?.id ?? '');
  const [nameAr, setNameAr] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [formatIds, setFormatIds] = useState<string[]>([]);
  const [facilityId, setFacilityId] = useState('');
  const [attributes, setAttributes] = useState<Record<string, string | boolean>>({});
  const [combines, setCombines] = useState<string[]>([]);
  const type = catalog.resourceTypes.find((rt) => rt.id === typeId);
  const formats = catalog.sports.flatMap((s) =>
    s.formats
      .filter((fm) => type?.sportFormatIds.includes(fm.id))
      .map((fm) => ({ ...fm, sport: s })),
  );

  const create = useVenueMutation(
    venue.id,
    () =>
      api(adminCreateResource, {
        params: { venueId: venue.id },
        body: {
          name: localized(nameAr, nameEn) ?? {},
          resourceTypeId: typeId,
          facilityId: facilityId || null,
          sportFormatIds: formatIds,
          attributes,
          ...(combines.length > 0 ? { combinesResourceIds: combines } : {}),
        },
      }),
    tt('added'),
  );

  return (
    <form
      className="mt-4 grid gap-4 border-t border-line pt-4 sm:grid-cols-2"
      onSubmit={async (e: FormEvent) => {
        e.preventDefault();
        await create.mutateAsync(undefined).then(onDone, () => undefined);
      }}
    >
      {create.isError ? (
        <Alert tone="error" className="sm:col-span-2">
          {errorMessage(create.error)}
        </Alert>
      ) : null}
      <SelectField
        label={t('resourceType')}
        value={typeId}
        onChange={(e) => {
          setTypeId(e.target.value);
          setFormatIds([]);
          setAttributes({});
        }}
        name="resourceType"
      >
        {catalog.resourceTypes.map((rt) => (
          <option key={rt.id} value={rt.id}>
            {pick(rt.name, locale)}
          </option>
        ))}
      </SelectField>
      <SelectField
        label={t('facility')}
        value={facilityId}
        onChange={(e) => setFacilityId(e.target.value)}
        name="facility"
      >
        <option value="">{t('noFacility')}</option>
        {venue.facilities.map((fa) => (
          <option key={fa.id} value={fa.id}>
            {pick(fa.name, locale)}
          </option>
        ))}
      </SelectField>
      <TextField
        label={t('resourceNameAr')}
        value={nameAr}
        onChange={(e) => setNameAr(e.target.value)}
        dir="rtl"
        lang="ar"
        name="resourceNameAr"
      />
      <TextField
        label={t('resourceNameEn')}
        value={nameEn}
        onChange={(e) => setNameEn(e.target.value)}
        dir="ltr"
        lang="en"
        name="resourceNameEn"
      />
      <fieldset className="sm:col-span-2">
        <legend className="mb-2 text-sm font-medium">{t('formats')}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {formats.map((fm) => (
            <CheckboxField
              key={fm.id}
              label={`${pick(fm.sport.name, locale)} — ${pick(fm.name, locale)}`}
              checked={formatIds.includes(fm.id)}
              onChange={(e) =>
                setFormatIds((ids) =>
                  e.target.checked ? [...ids, fm.id] : ids.filter((id) => id !== fm.id),
                )
              }
            />
          ))}
        </div>
      </fieldset>
      {type?.attributes.map((field) =>
        field.type === 'boolean' ? (
          <CheckboxField
            key={field.key}
            label={pick(field.label, locale)}
            checked={attributes[field.key] === true}
            onChange={(e) => setAttributes((a) => ({ ...a, [field.key]: e.target.checked }))}
          />
        ) : (
          <SelectField
            key={field.key}
            label={pick(field.label, locale)}
            value={
              typeof attributes[field.key] === 'string' ? (attributes[field.key] as string) : ''
            }
            onChange={(e) =>
              setAttributes((a) => {
                const next = { ...a };
                if (e.target.value) next[field.key] = e.target.value;
                else delete next[field.key];
                return next;
              })
            }
          >
            <option value="">—</option>
            {field.options.map((o) => (
              <option key={o.value} value={o.value}>
                {pick(o.label, locale)}
              </option>
            ))}
          </SelectField>
        ),
      )}
      {venue.resources.length >= 2 ? (
        <fieldset className="sm:col-span-2">
          <legend className="text-sm font-medium">{t('combines')}</legend>
          <p className="mb-2 text-xs text-ink-muted">{t('combinesHint')}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {venue.resources.map((r) => (
              <CheckboxField
                key={r.id}
                label={pick(r.name, locale)}
                checked={combines.includes(r.id)}
                onChange={(e) =>
                  setCombines((ids) =>
                    e.target.checked ? [...ids, r.id] : ids.filter((id) => id !== r.id),
                  )
                }
              />
            ))}
          </div>
        </fieldset>
      ) : null}
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" busy={create.isPending} disabled={formatIds.length === 0}>
          {tc('create')}
        </Button>
        <Button variant="secondary" onClick={onDone}>
          {tc('cancel')}
        </Button>
      </div>
    </form>
  );
}

function FacilitiesPanel({ venue }: { venue: AdminVenue }) {
  const t = useTranslations('admin');
  const tt = useTranslations('common.toast');
  const locale = useLocale();
  const api = useApi();
  const errorMessage = useErrorMessage();
  const [nameAr, setNameAr] = useState('');
  const [nameEn, setNameEn] = useState('');
  const add = useVenueMutation(
    venue.id,
    () =>
      api(adminCreateFacility, {
        params: { venueId: venue.id },
        body: { name: localized(nameAr, nameEn) ?? {} },
      }),
    tt('added'),
  );
  return (
    <Card>
      <h2 className="font-display text-2xl leading-tight">{t('venues.facilities')}</h2>
      <ul className="mt-2 flex flex-wrap gap-2">
        {venue.facilities.map((fa) => (
          <li key={fa.id}>
            <Badge>{pick(fa.name, locale)}</Badge>
          </li>
        ))}
      </ul>
      <form
        className="mt-4 grid items-end gap-3 sm:grid-cols-3"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          add.mutate(undefined, {
            onSuccess: () => {
              setNameAr('');
              setNameEn('');
            },
          });
        }}
      >
        {add.isError ? (
          <Alert tone="error" className="sm:col-span-3">
            {errorMessage(add.error)}
          </Alert>
        ) : null}
        <TextField
          label={t('organizations.nameAr')}
          value={nameAr}
          onChange={(e) => setNameAr(e.target.value)}
          dir="rtl"
          lang="ar"
        />
        <TextField
          label={t('organizations.nameEn')}
          value={nameEn}
          onChange={(e) => setNameEn(e.target.value)}
          dir="ltr"
          lang="en"
        />
        <Button type="submit" variant="secondary" busy={add.isPending}>
          {t('venues.addFacility')}
        </Button>
      </form>
    </Card>
  );
}

function PhotosPanel({ venue }: { venue: AdminVenue }) {
  const t = useTranslations('admin.venues');
  const tt = useTranslations('common.toast');
  const locale = useLocale();
  const api = useApi();
  const errorMessage = useErrorMessage();
  const upload = useVenueMutation(
    venue.id,
    (file: File) => api(adminUploadVenueMedia, { params: { venueId: venue.id }, file }),
    tt('uploaded'),
  );
  const remove = useVenueMutation(
    venue.id,
    (mediaId: string) => api(adminDeleteVenueMedia, { params: { mediaId } }),
    tt('removed'),
  );
  const error = upload.error ?? remove.error;

  return (
    <Card>
      <h2 className="font-display text-2xl leading-tight">{t('photos')}</h2>
      {error ? (
        <Alert tone="error" className="mt-3">
          {errorMessage(error)}
        </Alert>
      ) : null}
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {venue.media.map((m) => (
          <figure key={m.id} className="flex flex-col gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- admin preview of private images */}
            <img
              src={`/api/v1/admin/media/${m.id}`}
              alt={pick(venue.name, locale)}
              width={m.width}
              height={m.height}
              className="aspect-video w-full rounded-tile object-cover"
            />
            <Button
              size="sm"
              variant="ghost"
              onClick={() => remove.mutate(m.id)}
              busy={remove.isPending && remove.variables === m.id}
            >
              {t('deletePhoto')}
            </Button>
          </figure>
        ))}
      </div>
      <label className="mt-4 block">
        <span className="text-sm font-medium">{t('upload')}</span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          name="photo"
          className="mt-2 block w-full text-sm"
          disabled={upload.isPending}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) upload.mutate(file);
            e.target.value = '';
          }}
        />
        <span className="mt-1 block text-xs text-ink-muted">{t('uploadHint')}</span>
      </label>
    </Card>
  );
}
