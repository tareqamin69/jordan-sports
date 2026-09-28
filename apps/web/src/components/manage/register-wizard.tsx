'use client';

import {
  createMyResource,
  deleteMyVenueMedia,
  getMyVenueProfile,
  registerVenue,
  submitMyVenue,
  updateMyVenue,
  uploadMyVenueMedia,
  type AdminVenue,
  type Catalog,
} from '@jordan-sports/contracts';
import {
  Alert,
  Button,
  Card,
  CheckboxField,
  PageHeader,
  SelectField,
  Spinner,
  TextAreaField,
  TextField,
} from '@jordan-sports/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { useRouter } from '@/i18n/navigation';
import { useApi } from '@/lib/api';
import { useCatalog } from '@/lib/catalog';
import { pick } from '@/lib/localized';
import { useErrorMessage } from '@/lib/use-error-message';
import { LocationPicker } from './location-picker';

type Localized = { ar?: string; en?: string };

function localized(ar: string, en: string): Localized | undefined {
  const value: Localized = {};
  if (ar.trim()) value.ar = ar.trim();
  if (en.trim()) value.en = en.trim();
  return value.ar || value.en ? value : undefined;
}

const steps = ['info', 'location', 'photos', 'courts', 'payment', 'review'] as const;
type Step = (typeof steps)[number];

function Stepper({ current }: { current: Step }) {
  const t = useTranslations('web.manage.register');
  const index = steps.indexOf(current);
  return (
    <ol className="no-scrollbar mb-6 flex gap-2 overflow-x-auto">
      {steps.map((s, i) => (
        <li
          key={s}
          className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium ${
            i === index
              ? 'border-primary bg-brand-50 text-primary'
              : i < index
                ? 'border-line-strong text-ink'
                : 'border-line text-ink-muted'
          }`}
        >
          <span
            className={`grid size-5 shrink-0 place-items-center rounded-full text-xs ${
              i <= index ? 'bg-primary text-canvas' : 'bg-canvas-deep text-ink-muted'
            }`}
          >
            {i + 1}
          </span>
          {t(`steps.${s}`)}
        </li>
      ))}
    </ol>
  );
}

/**
 * Venue self-registration wizard (plan §3): info → location → photos → courts → payment/contact
 * → review & submit. Reuses the same owner-scoped `/v1/manage/*` endpoints the venue dashboard
 * uses to edit hours/pricing — those stay reachable from the review step and from the dashboard
 * itself while the venue is still in review (plan: "editing while in review: allowed").
 */
export function RegisterWizard({ venueId: initialVenueId }: { venueId?: string }) {
  const t = useTranslations('web.manage.register');
  const api = useApi();
  const router = useRouter();
  const queryClient = useQueryClient();
  const errorMessage = useErrorMessage();
  const catalog = useCatalog();
  const [venue, setVenue] = useState<AdminVenue | null>(null);
  const [step, setStep] = useState<Step>('info');
  const [submitted, setSubmitted] = useState(false);

  const existing = useQuery({
    queryKey: ['my-venue', initialVenueId],
    queryFn: () => api(getMyVenueProfile, { params: { venueId: initialVenueId! } }),
    enabled: initialVenueId !== undefined && venue === null,
  });
  if (existing.data && venue === null) setVenue(existing.data);

  if (initialVenueId && existing.isPending && venue === null) {
    return <Spinner label={t('title')} />;
  }
  if (existing.isError) {
    return <Alert tone="error">{errorMessage(existing.error)}</Alert>;
  }
  if (catalog.isPending) return <Spinner label={t('title')} />;
  if (catalog.isError) return <Alert tone="error">{errorMessage(catalog.error)}</Alert>;

  function onCreated(v: AdminVenue) {
    setVenue(v);
    void queryClient.invalidateQueries({ queryKey: ['managed-venues'] });
  }

  if (submitted && venue) {
    return (
      <Card className="flex flex-col items-start gap-3 text-start">
        <p className="font-display text-2xl">{t('submitted')}</p>
        <p className="text-ink-muted">{t('submittedHint')}</p>
        <Button onClick={() => router.push(`/manage/${venue.id}`)}>{t('goToDashboard')}</Button>
      </Card>
    );
  }

  return (
    <>
      <PageHeader
        title={t('title')}
        description={t('stepOf', { step: steps.indexOf(step) + 1, total: steps.length })}
      />
      <Stepper current={step} />
      {step === 'info' ? (
        <InfoStep
          venue={venue}
          catalog={catalog.data}
          onNext={(v) => {
            onCreated(v);
            setStep('location');
          }}
        />
      ) : null}
      {step === 'location' && venue ? (
        <LocationStep
          venue={venue}
          onBack={() => setStep('info')}
          onNext={(v) => {
            setVenue(v);
            setStep('photos');
          }}
        />
      ) : null}
      {step === 'photos' && venue ? (
        <PhotosStep
          venue={venue}
          onBack={() => setStep('location')}
          onNext={(v) => {
            setVenue(v);
            setStep('courts');
          }}
        />
      ) : null}
      {step === 'courts' && venue ? (
        <CourtsStep
          venue={venue}
          catalog={catalog.data}
          onBack={() => setStep('photos')}
          onNext={(v) => {
            setVenue(v);
            setStep('payment');
          }}
        />
      ) : null}
      {step === 'payment' && venue ? (
        <PaymentStep
          venue={venue}
          onBack={() => setStep('courts')}
          onNext={(v) => {
            setVenue(v);
            setStep('review');
          }}
        />
      ) : null}
      {step === 'review' && venue ? (
        <ReviewStep
          venue={venue}
          onBack={() => setStep('payment')}
          onSubmitted={() => {
            void queryClient.invalidateQueries({ queryKey: ['managed-venues'] });
            setSubmitted(true);
          }}
        />
      ) : null}
    </>
  );
}

function StepActions({
  onBack,
  busy,
  nextLabel,
  nextDisabled,
}: {
  onBack?: () => void;
  busy: boolean;
  nextLabel: string;
  nextDisabled?: boolean;
}) {
  const tc = useTranslations('web.manage.register');
  return (
    <div className="mt-6 flex gap-2 sm:col-span-2">
      <Button type="submit" busy={busy} disabled={nextDisabled}>
        {nextLabel}
      </Button>
      {onBack ? (
        <Button type="button" variant="secondary" onClick={onBack}>
          {tc('back')}
        </Button>
      ) : null}
    </div>
  );
}

function InfoStep({
  venue,
  catalog,
  onNext,
}: {
  venue: AdminVenue | null;
  catalog: Catalog;
  onNext: (venue: AdminVenue) => void;
}) {
  const t = useTranslations('web.manage.register');
  const locale = useLocale();
  const api = useApi();
  const errorMessage = useErrorMessage();
  const [f, setF] = useState({
    nameAr: venue?.name.ar ?? '',
    nameEn: venue?.name.en ?? '',
    governorateId: venue?.governorateId ?? catalog.governorates[0]?.id ?? '',
    areaId: venue?.areaId ?? '',
    contactPhone: venue?.contactPhone ?? '',
  });
  const set = (key: keyof typeof f) => (e: { target: { value: string } }) =>
    setF((s) => ({ ...s, [key]: e.target.value }));
  const areas = catalog.governorates.find((g) => g.id === f.governorateId)?.areas ?? [];

  const create = useMutation({
    mutationFn: () =>
      venue
        ? api(updateMyVenue, {
            params: { venueId: venue.id },
            body: {
              name: localized(f.nameAr, f.nameEn),
              governorateId: f.governorateId,
              areaId: f.areaId || null,
              contactPhone: f.contactPhone.trim(),
            },
          })
        : api(registerVenue, {
            body: {
              name: localized(f.nameAr, f.nameEn) ?? {},
              governorateId: f.governorateId,
              areaId: f.areaId || null,
              contactPhone: f.contactPhone.trim(),
            },
          }),
    onSuccess: onNext,
  });

  return (
    <Card>
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
          label={t('nameAr')}
          value={f.nameAr}
          onChange={set('nameAr')}
          dir="rtl"
          lang="ar"
          required
          name="nameAr"
        />
        <TextField
          label={t('nameEn')}
          value={f.nameEn}
          onChange={set('nameEn')}
          dir="ltr"
          lang="en"
          name="nameEn"
        />
        <SelectField
          label={t('governorate')}
          value={f.governorateId}
          onChange={(e) => setF((s) => ({ ...s, governorateId: e.target.value, areaId: '' }))}
          name="governorateId"
        >
          {catalog.governorates.map((g) => (
            <option key={g.id} value={g.id}>
              {pick(g.name, locale)}
            </option>
          ))}
        </SelectField>
        <SelectField label={t('area')} value={f.areaId} onChange={set('areaId')} name="areaId">
          <option value="">{t('noArea')}</option>
          {areas.map((a) => (
            <option key={a.id} value={a.id}>
              {pick(a.name, locale)}
            </option>
          ))}
        </SelectField>
        <TextField
          label={t('phone')}
          hint={t('phoneHint')}
          value={f.contactPhone}
          onChange={set('contactPhone')}
          type="tel"
          dir="ltr"
          required
          name="contactPhone"
        />
        <StepActions busy={create.isPending} nextLabel={t('next')} />
      </form>
    </Card>
  );
}

function LocationStep({
  venue,
  onBack,
  onNext,
}: {
  venue: AdminVenue;
  onBack: () => void;
  onNext: (venue: AdminVenue) => void;
}) {
  const t = useTranslations('web.manage.register');
  const api = useApi();
  const errorMessage = useErrorMessage();
  const [f, setF] = useState({
    descriptionAr: venue.description.ar ?? '',
    descriptionEn: venue.description.en ?? '',
    addressAr: venue.address.ar ?? '',
    addressEn: venue.address.en ?? '',
  });
  const [location, setLocation] = useState(venue.location);
  const set = (key: keyof typeof f) => (e: { target: { value: string } }) =>
    setF((s) => ({ ...s, [key]: e.target.value }));

  const save = useMutation({
    mutationFn: () =>
      api(updateMyVenue, {
        params: { venueId: venue.id },
        body: {
          description: localized(f.descriptionAr, f.descriptionEn),
          address: localized(f.addressAr, f.addressEn),
          location,
        },
      }),
    onSuccess: onNext,
  });

  return (
    <Card>
      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        {save.isError ? (
          <Alert tone="error" className="sm:col-span-2">
            {errorMessage(save.error)}
          </Alert>
        ) : null}
        <TextAreaField
          label={t('descriptionAr')}
          value={f.descriptionAr}
          onChange={set('descriptionAr')}
          dir="rtl"
          lang="ar"
        />
        <TextAreaField
          label={t('descriptionEn')}
          value={f.descriptionEn}
          onChange={set('descriptionEn')}
          dir="ltr"
          lang="en"
        />
        <TextField
          label={t('address')}
          value={f.addressAr}
          onChange={set('addressAr')}
          dir="rtl"
          lang="ar"
        />
        <TextField
          label={`${t('address')} (EN)`}
          value={f.addressEn}
          onChange={set('addressEn')}
          dir="ltr"
          lang="en"
        />
        <div className="sm:col-span-2">
          <LocationPicker location={location} onChange={setLocation} />
        </div>
        <StepActions onBack={onBack} busy={save.isPending} nextLabel={t('next')} />
      </form>
    </Card>
  );
}

function PhotosStep({
  venue,
  onBack,
  onNext,
}: {
  venue: AdminVenue;
  onBack: () => void;
  onNext: (venue: AdminVenue) => void;
}) {
  const t = useTranslations('web.manage.register');
  const locale = useLocale();
  const api = useApi();
  const errorMessage = useErrorMessage();
  const [current, setCurrent] = useState(venue);
  const upload = useMutation({
    mutationFn: (file: File) => api(uploadMyVenueMedia, { params: { venueId: venue.id }, file }),
    onSuccess: setCurrent,
  });
  const remove = useMutation({
    mutationFn: (mediaId: string) => api(deleteMyVenueMedia, { params: { mediaId } }),
    onSuccess: setCurrent,
  });
  const error = upload.error ?? remove.error;

  return (
    <Card>
      <p className="text-ink-muted">{t('photosIntro')}</p>
      {error ? (
        <Alert tone="error" className="mt-3">
          {errorMessage(error)}
        </Alert>
      ) : null}
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {current.media.map((m) => (
          <figure key={m.id} className="flex flex-col gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- owner preview of a private, unapproved photo */}
            <img
              src={`/api/v1/manage/media/${m.id}`}
              alt={pick(current.name, locale)}
              width={m.width}
              height={m.height}
              className="aspect-video w-full rounded-tile object-cover"
            />
            <Button
              size="sm"
              variant="ghost"
              type="button"
              onClick={() => remove.mutate(m.id)}
              busy={remove.isPending && remove.variables === m.id}
            >
              {t('deletePhoto')}
            </Button>
          </figure>
        ))}
      </div>
      <label className="mt-4 block">
        <span className="text-sm font-medium">{t('uploadPhoto')}</span>
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
      <div className="mt-6 flex gap-2">
        <Button type="button" onClick={() => onNext(current)}>
          {t('next')}
        </Button>
        <Button type="button" variant="secondary" onClick={onBack}>
          {t('back')}
        </Button>
      </div>
    </Card>
  );
}

function CourtsStep({
  venue,
  catalog,
  onBack,
  onNext,
}: {
  venue: AdminVenue;
  catalog: Catalog;
  onBack: () => void;
  onNext: (venue: AdminVenue) => void;
}) {
  const t = useTranslations('web.manage.register');
  const locale = useLocale();
  const api = useApi();
  const errorMessage = useErrorMessage();
  const [current, setCurrent] = useState(venue);
  const [typeId, setTypeId] = useState(catalog.resourceTypes[0]?.id ?? '');
  const [nameAr, setNameAr] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [formatIds, setFormatIds] = useState<string[]>([]);
  const type = catalog.resourceTypes.find((rt) => rt.id === typeId);
  const formats = catalog.sports.flatMap((s) =>
    s.formats
      .filter((fm) => type?.sportFormatIds.includes(fm.id))
      .map((fm) => ({ ...fm, sport: s })),
  );

  const add = useMutation({
    mutationFn: () =>
      api(createMyResource, {
        params: { venueId: venue.id },
        body: {
          name: localized(nameAr, nameEn) ?? {},
          resourceTypeId: typeId,
          facilityId: null,
          sportFormatIds: formatIds,
          attributes: {},
        },
      }),
    onSuccess: (v) => {
      setCurrent(v);
      setNameAr('');
      setNameEn('');
      setFormatIds([]);
    },
  });

  return (
    <Card>
      <p className="text-ink-muted">{t('courtsIntro')}</p>
      {current.resources.length === 0 ? (
        <p className="mt-2 text-sm text-ink-muted">{t('noCourts')}</p>
      ) : (
        <ul className="mt-3 flex flex-wrap gap-2">
          {current.resources.map((r) => (
            <li key={r.id} className="rounded-full border border-line px-3 py-1.5 text-sm">
              {pick(r.name, locale)}
            </li>
          ))}
        </ul>
      )}
      <form
        className="mt-4 grid gap-4 border-t border-line pt-4 sm:grid-cols-2"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          add.mutate();
        }}
      >
        {add.isError ? (
          <Alert tone="error" className="sm:col-span-2">
            {errorMessage(add.error)}
          </Alert>
        ) : null}
        <SelectField
          label={t('courtType')}
          value={typeId}
          onChange={(e) => {
            setTypeId(e.target.value);
            setFormatIds([]);
          }}
          name="resourceType"
        >
          {catalog.resourceTypes.map((rt) => (
            <option key={rt.id} value={rt.id}>
              {pick(rt.name, locale)}
            </option>
          ))}
        </SelectField>
        <TextField
          label={t('courtNameAr')}
          value={nameAr}
          onChange={(e) => setNameAr(e.target.value)}
          dir="rtl"
          lang="ar"
          name="courtNameAr"
        />
        <TextField
          label={t('courtNameEn')}
          value={nameEn}
          onChange={(e) => setNameEn(e.target.value)}
          dir="ltr"
          lang="en"
          name="courtNameEn"
        />
        <fieldset className="sm:col-span-2">
          <legend className="mb-2 text-sm font-medium">{t('courtFormats')}</legend>
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
        <div className="sm:col-span-2">
          <Button
            type="submit"
            variant="secondary"
            busy={add.isPending}
            disabled={formatIds.length === 0}
          >
            {t('addCourt')}
          </Button>
        </div>
      </form>
      <div className="mt-6 flex gap-2">
        <Button
          type="button"
          onClick={() => onNext(current)}
          disabled={current.resources.length === 0}
        >
          {t('next')}
        </Button>
        <Button type="button" variant="secondary" onClick={onBack}>
          {t('back')}
        </Button>
      </div>
      {current.resources.length === 0 ? (
        <p className="mt-2 text-sm text-warning">{t('needsCourt')}</p>
      ) : null}
    </Card>
  );
}

function PaymentStep({
  venue,
  onBack,
  onNext,
}: {
  venue: AdminVenue;
  onBack: () => void;
  onNext: (venue: AdminVenue) => void;
}) {
  const t = useTranslations('web.manage.register');
  const api = useApi();
  const errorMessage = useErrorMessage();
  const [f, setF] = useState({
    whatsapp: venue.whatsapp ?? '',
    cliqAlias: venue.cliqAlias ?? '',
    cliqAliasHolderName: venue.cliqAliasHolderName ?? '',
    depositPercentage: venue.depositPercentage !== null ? String(venue.depositPercentage) : '',
  });
  const set = (key: keyof typeof f) => (e: { target: { value: string } }) =>
    setF((s) => ({ ...s, [key]: e.target.value }));

  const save = useMutation({
    mutationFn: () =>
      api(updateMyVenue, {
        params: { venueId: venue.id },
        body: {
          whatsapp: f.whatsapp.trim() || null,
          cliqAlias: f.cliqAlias.trim() || null,
          cliqAliasHolderName: f.cliqAliasHolderName.trim() || null,
          depositPercentage: f.depositPercentage.trim() ? Number(f.depositPercentage) : null,
        },
      }),
    onSuccess: onNext,
  });

  return (
    <Card>
      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <p className="text-ink-muted sm:col-span-2">{t('paymentIntro')}</p>
        {save.isError ? (
          <Alert tone="error" className="sm:col-span-2">
            {errorMessage(save.error)}
          </Alert>
        ) : null}
        <TextField
          label={t('whatsapp')}
          hint={t('whatsappHint')}
          value={f.whatsapp}
          onChange={set('whatsapp')}
          type="tel"
          dir="ltr"
          name="whatsapp"
        />
        <TextField
          label={t('cliqAlias')}
          hint={t('cliqAliasHint')}
          value={f.cliqAlias}
          onChange={set('cliqAlias')}
          dir="ltr"
          name="cliqAlias"
        />
        <TextField
          label={t('cliqHolder')}
          value={f.cliqAliasHolderName}
          onChange={set('cliqAliasHolderName')}
          name="cliqAliasHolderName"
        />
        <TextField
          label={t('depositPercentage')}
          hint={t('depositHint')}
          value={f.depositPercentage}
          onChange={set('depositPercentage')}
          inputMode="numeric"
          dir="ltr"
          name="depositPercentage"
        />
        <StepActions onBack={onBack} busy={save.isPending} nextLabel={t('next')} />
      </form>
    </Card>
  );
}

function ReviewStep({
  venue,
  onBack,
  onSubmitted,
}: {
  venue: AdminVenue;
  onBack: () => void;
  onSubmitted: () => void;
}) {
  const t = useTranslations('web.manage.register');
  const locale = useLocale();
  const api = useApi();
  const errorMessage = useErrorMessage();

  const submit = useMutation({
    mutationFn: () => api(submitMyVenue, { params: { venueId: venue.id } }),
    onSuccess: onSubmitted,
  });

  return (
    <Card className="flex flex-col gap-4">
      <p className="font-display text-2xl">{t('reviewTitle')}</p>
      <p className="text-ink-muted">{t('reviewHint')}</p>
      <dl className="grid gap-3 sm:grid-cols-2">
        <div>
          <dt className="text-sm text-ink-muted">{t('nameAr')}</dt>
          <dd className="font-medium">{pick(venue.name, locale)}</dd>
        </div>
        <div>
          <dt className="text-sm text-ink-muted">{t('phone')}</dt>
          <dd className="font-medium" dir="ltr">
            {venue.contactPhone}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-ink-muted">{t('address')}</dt>
          <dd className="font-medium">{pick(venue.address, locale) || '—'}</dd>
        </div>
        <div>
          <dt className="text-sm text-ink-muted">{t('courtType')}</dt>
          <dd className="font-medium">
            {venue.resources.map((r) => pick(r.name, locale)).join('، ') || '—'}
          </dd>
        </div>
      </dl>
      <a
        href={`/manage/${venue.id}?tab=hours`}
        className="text-sm font-medium text-primary hover:underline"
      >
        {t('editHoursPrices')}
      </a>
      {submit.isError ? <Alert tone="error">{errorMessage(submit.error)}</Alert> : null}
      <div className="flex gap-2">
        <Button onClick={() => submit.mutate()} busy={submit.isPending}>
          {t('submit')}
        </Button>
        <Button type="button" variant="secondary" onClick={onBack}>
          {t('back')}
        </Button>
      </div>
    </Card>
  );
}
