'use client';

import {
  deleteMyVenueMedia,
  getMyVenueProfile,
  reorderMyVenueMedia,
  updateMyVenue,
  uploadMyVenueMedia,
  type AdminVenue,
  type VenueSchedule,
} from '@jordan-sports/contracts';
import {
  Alert,
  Button,
  Card,
  CheckboxField,
  FormSkeleton,
  TextAreaField,
  TextField,
  buttonClass,
  cx,
} from '@jordan-sports/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useId, useState, type FormEvent } from 'react';
import { useApi } from '@/lib/api';
import { useCatalog } from '@/lib/catalog';
import { pick } from '@/lib/localized';
import { useErrorMessage } from '@/lib/use-error-message';

const opt = (v: string) => (v.trim() ? v.trim() : undefined);

interface Form {
  nameAr: string;
  nameEn: string;
  descAr: string;
  descEn: string;
  addrAr: string;
  addrEn: string;
  phone: string;
  whatsapp: string;
  amenityIds: string[];
}

function toForm(v: AdminVenue): Form {
  return {
    nameAr: v.name.ar ?? '',
    nameEn: v.name.en ?? '',
    descAr: v.description.ar ?? '',
    descEn: v.description.en ?? '',
    addrAr: v.address.ar ?? '',
    addrEn: v.address.en ?? '',
    phone: v.contactPhone ?? '',
    whatsapp: v.whatsapp ?? '',
    amenityIds: v.amenityIds,
  };
}

/** Venue owner: name, description, address, contacts, amenities and photos (add, remove, reorder). */
export function VenueProfilePanel({ schedule }: { schedule: VenueSchedule }) {
  const venueId = schedule.venue.id;
  const tc = useTranslations('common');
  const api = useApi();
  const errorMessage = useErrorMessage();
  const profile = useQuery({
    queryKey: ['venue-profile', venueId],
    queryFn: () => api(getMyVenueProfile, { params: { venueId } }),
  });
  if (profile.isError) return <Alert tone="error">{errorMessage(profile.error)}</Alert>;
  if (!profile.data) return <FormSkeleton label={tc('loading')} fields={5} />;
  return (
    <div className="flex flex-col gap-6" data-testid="venue-profile">
      <ProfileForm venue={profile.data} />
      <PhotosEditor venue={profile.data} />
    </div>
  );
}

function useProfileCache(venueId: string) {
  const queryClient = useQueryClient();
  return (venue: AdminVenue) => {
    queryClient.setQueryData(['venue-profile', venueId], venue);
    // The dashboard header and status banner read the schedule.
    void queryClient.invalidateQueries({ queryKey: ['schedule', venueId] });
  };
}

function ProfileForm({ venue }: { venue: AdminVenue }) {
  const t = useTranslations('web.manage.profile');
  const tc = useTranslations('common');
  const locale = useLocale();
  const api = useApi();
  const errorMessage = useErrorMessage();
  const catalog = useCatalog();
  const cache = useProfileCache(venue.id);
  const [edited, setEdited] = useState<Form | null>(null);
  const f = edited ?? toForm(venue);
  const set = (patch: Partial<Form>) => setEdited({ ...f, ...patch });
  const save = useMutation({
    mutationFn: () =>
      api(updateMyVenue, {
        params: { venueId: venue.id },
        body: {
          name: {
            ...(opt(f.nameAr) ? { ar: f.nameAr.trim() } : {}),
            ...(opt(f.nameEn) ? { en: f.nameEn.trim() } : {}),
          },
          description: {
            ...(opt(f.descAr) ? { ar: f.descAr.trim() } : {}),
            ...(opt(f.descEn) ? { en: f.descEn.trim() } : {}),
          },
          address: {
            ...(opt(f.addrAr) ? { ar: f.addrAr.trim() } : {}),
            ...(opt(f.addrEn) ? { en: f.addrEn.trim() } : {}),
          },
          contactPhone: opt(f.phone) ?? null,
          whatsapp: opt(f.whatsapp) ?? null,
          amenityIds: f.amenityIds,
        },
      }),
    meta: { toast: t('saved') },
    onSuccess: (data) => {
      cache(data);
      setEdited(null);
    },
  });
  const hasName = f.nameAr.trim() !== '' || f.nameEn.trim() !== '';

  return (
    <Card>
      <h2 className="mb-1 font-display text-2xl">{t('title')}</h2>
      <p className="mb-4 text-sm text-ink-muted">{t('nameNote')}</p>
      {save.isError ? (
        <Alert tone="error" className="mb-3">
          {errorMessage(save.error)}
        </Alert>
      ) : null}
      {/* "Saved" is a toast; that the venue went back to review stays on screen. */}
      {save.isSuccess && edited === null && venue.status === 'submitted' && venue.statusReason ? (
        <Alert tone="info" className="mb-3">
          {t('backToReview')}
        </Alert>
      ) : null}
      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          if (hasName) save.mutate();
        }}
      >
        <TextField
          label={t('nameAr')}
          dir="rtl"
          value={f.nameAr}
          onChange={(e) => set({ nameAr: e.target.value })}
          name="nameAr"
          maxLength={120}
        />
        <TextField
          label={t('nameEn')}
          dir="ltr"
          value={f.nameEn}
          onChange={(e) => set({ nameEn: e.target.value })}
          name="nameEn"
          maxLength={120}
        />
        <TextAreaField
          label={t('descAr')}
          dir="rtl"
          rows={3}
          value={f.descAr}
          onChange={(e) => set({ descAr: e.target.value })}
          name="descAr"
          maxLength={2000}
        />
        <TextAreaField
          label={t('descEn')}
          dir="ltr"
          rows={3}
          value={f.descEn}
          onChange={(e) => set({ descEn: e.target.value })}
          name="descEn"
          maxLength={2000}
        />
        <TextField
          label={t('addrAr')}
          dir="rtl"
          value={f.addrAr}
          onChange={(e) => set({ addrAr: e.target.value })}
          name="addrAr"
          maxLength={300}
        />
        <TextField
          label={t('addrEn')}
          dir="ltr"
          value={f.addrEn}
          onChange={(e) => set({ addrEn: e.target.value })}
          name="addrEn"
          maxLength={300}
        />
        <TextField
          label={t('phone')}
          inputMode="tel"
          dir="ltr"
          value={f.phone}
          onChange={(e) => set({ phone: e.target.value })}
          name="phone"
        />
        <TextField
          label={t('whatsapp')}
          hint={t('whatsappHint')}
          inputMode="tel"
          dir="ltr"
          value={f.whatsapp}
          onChange={(e) => set({ whatsapp: e.target.value })}
          name="whatsapp"
        />
        {catalog.data && catalog.data.amenities.length > 0 ? (
          <fieldset className="sm:col-span-2">
            <legend className="mb-2 text-sm font-medium">{t('amenities')}</legend>
            <div className="flex flex-wrap gap-x-5 gap-y-1">
              {catalog.data.amenities.map((a) => (
                <CheckboxField
                  key={a.id}
                  label={pick(a.name, locale)}
                  checked={f.amenityIds.includes(a.id)}
                  onChange={(e) =>
                    set({
                      amenityIds: e.target.checked
                        ? [...f.amenityIds, a.id]
                        : f.amenityIds.filter((x) => x !== a.id),
                    })
                  }
                />
              ))}
            </div>
          </fieldset>
        ) : null}
        <div className="sm:col-span-2">
          <Button type="submit" busy={save.isPending} disabled={edited === null || !hasName}>
            {tc('actions.save')}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function PhotosEditor({ venue }: { venue: AdminVenue }) {
  const t = useTranslations('web.manage.profile');
  const locale = useLocale();
  const api = useApi();
  const errorMessage = useErrorMessage();
  const cache = useProfileCache(venue.id);
  const tt = useTranslations('common.toast');
  const inputId = useId();
  const upload = useMutation({
    mutationFn: (file: File) => api(uploadMyVenueMedia, { params: { venueId: venue.id }, file }),
    meta: { toast: tt('uploaded') },
    onSuccess: cache,
  });
  const remove = useMutation({
    mutationFn: (mediaId: string) => api(deleteMyVenueMedia, { params: { mediaId } }),
    meta: { toast: tt('removed') },
    onSuccess: cache,
  });
  const reorder = useMutation({
    mutationFn: (mediaIds: string[]) =>
      api(reorderMyVenueMedia, { params: { venueId: venue.id }, body: { mediaIds } }),
    onSuccess: cache,
  });
  const error = upload.error ?? remove.error ?? reorder.error;
  const ids = venue.media.map((m) => m.id);
  const move = (index: number, by: -1 | 1) => {
    const next = [...ids];
    const [item] = next.splice(index, 1);
    next.splice(index + by, 0, item!);
    reorder.mutate(next);
  };

  return (
    <Card>
      <h2 className="mb-1 font-display text-2xl">{t('photosTitle')}</h2>
      <p className="mb-3 text-sm text-ink-muted">{t('photosIntro')}</p>
      {error ? (
        <Alert tone="error" className="mb-3">
          {errorMessage(error)}
        </Alert>
      ) : null}
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="profile-photos">
        {venue.media.map((m, i) => (
          <li key={m.id} className="flex flex-col gap-2">
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element -- owner preview of a private photo */}
              <img
                src={`/api/v1/manage/media/${m.id}`}
                alt={pick(venue.name, locale)}
                width={m.width}
                height={m.height}
                className="aspect-video w-full rounded-tile object-cover"
              />
              {i === 0 ? (
                <span className="absolute start-2 top-2 rounded-full bg-night px-2 py-0.5 text-xs text-canvas">
                  {t('cover')}
                </span>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-1">
              <Button
                size="sm"
                variant="secondary"
                type="button"
                disabled={i === 0 || reorder.isPending}
                onClick={() => move(i, -1)}
                aria-label={t('moveEarlier')}
              >
                {t('earlier')}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                type="button"
                disabled={i === ids.length - 1 || reorder.isPending}
                onClick={() => move(i, 1)}
                aria-label={t('moveLater')}
              >
                {t('later')}
              </Button>
              <Button
                size="sm"
                variant="ghostDanger"
                type="button"
                busy={remove.isPending && remove.variables === m.id}
                onClick={() => remove.mutate(m.id)}
              >
                {t('deletePhoto')}
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-4">
        <input
          type="file"
          id={inputId}
          accept="image/jpeg,image/png,image/webp"
          name="photo"
          className="sr-only"
          disabled={upload.isPending}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) upload.mutate(file);
            e.target.value = '';
          }}
        />
        <label
          htmlFor={inputId}
          className={cx(
            buttonClass({ variant: 'secondary', size: 'sm' }),
            upload.isPending && 'pointer-events-none opacity-60',
          )}
        >
          {t('uploadPhoto')}
        </label>
        <p className="mt-1 text-xs text-ink-muted">{t('uploadHint')}</p>
      </div>
    </Card>
  );
}
