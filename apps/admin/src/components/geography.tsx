'use client';

import {
  adminCreateArea,
  adminCreateGovernorate,
  adminCreateSport,
  adminListSports,
  adminUpdateArea,
  adminUpdateGovernorate,
  adminUpdateSport,
  type Catalog,
} from '@jordan-sports/contracts';
import {
  Alert,
  Button,
  Card,
  ListSkeleton,
  PageHeader,
  DEFAULT_SPORT_ICON,
  SPORT_ICON_KEYS,
  SelectField,
  SportIcon,
  TextField,
  cx,
} from '@jordan-sports/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { useApi } from '@/lib/api';
import { useCatalog } from '@/lib/catalog';
import { pick } from '@/lib/localized';
import { useErrorMessage } from '@/lib/use-error-message';

/** Catalog keys are generated from the English name ("Irbid City" → irbid_city) unless edited. */
function slugKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
}

function setCatalog(queryClient: ReturnType<typeof useQueryClient>, data: Catalog) {
  queryClient.setQueryData(['catalog'], data);
}

export function GeographyPage() {
  const t = useTranslations('admin.geography');
  const tc = useTranslations('common');
  const catalog = useCatalog();

  return (
    <>
      <PageHeader title={t('title')} description={t('description')} />
      {catalog.isPending ? <ListSkeleton label={tc('loading')} rows={4} thumb={false} /> : null}
      {catalog.data ? (
        <div className="flex flex-col gap-8">
          <GovernoratesSection catalog={catalog.data} />
          <AreasSection catalog={catalog.data} />
          <SportsSection />
        </div>
      ) : null}
    </>
  );
}

function GovernoratesSection({ catalog }: { catalog: Catalog }) {
  const t = useTranslations('admin.geography');
  const tt = useTranslations('common.toast');
  const locale = useLocale();
  const api = useApi();
  const queryClient = useQueryClient();
  const errorMessage = useErrorMessage();
  const [form, setForm] = useState<{ key: string | null; nameAr: string; nameEn: string }>({
    key: null,
    nameAr: '',
    nameEn: '',
  });
  const [renaming, setRenaming] = useState<{ id: string; nameAr: string; nameEn: string } | null>(
    null,
  );
  const create = useMutation({
    meta: { toast: tt('added') },
    mutationFn: () =>
      api(adminCreateGovernorate, {
        body: {
          key: (form.key ?? slugKey(form.nameEn)).trim(),
          name: { ar: form.nameAr.trim(), en: form.nameEn.trim() },
        },
      }),
    onSuccess: (data) => {
      setCatalog(queryClient, data);
      setForm({ key: null, nameAr: '', nameEn: '' });
    },
  });
  const rename = useMutation({
    meta: { toast: tt('updated') },
    mutationFn: (input: { id: string; name: { ar: string; en: string } }) =>
      api(adminUpdateGovernorate, {
        params: { governorateId: input.id },
        body: { name: input.name },
      }),
    onSuccess: (data) => {
      setCatalog(queryClient, data);
      setRenaming(null);
    },
  });

  return (
    <section>
      <h2 className="mb-3 font-display text-2xl leading-[1.35]">{t('governorates')}</h2>
      <Card className="mb-4 p-0">
        <ul className="divide-y divide-line">
          {catalog.governorates.map((g) =>
            renaming?.id === g.id ? (
              <li key={g.id} className="flex flex-wrap items-end gap-3 px-5 py-3">
                <TextField
                  label={t('nameAr')}
                  value={renaming.nameAr}
                  onChange={(e) => setRenaming((r) => r && { ...r, nameAr: e.target.value })}
                  dir="rtl"
                  lang="ar"
                />
                <TextField
                  label={t('nameEn')}
                  value={renaming.nameEn}
                  onChange={(e) => setRenaming((r) => r && { ...r, nameEn: e.target.value })}
                  dir="ltr"
                  lang="en"
                />
                <Button
                  size="sm"
                  busy={rename.isPending}
                  onClick={() =>
                    rename.mutate({
                      id: g.id,
                      name: { ar: renaming.nameAr.trim(), en: renaming.nameEn.trim() },
                    })
                  }
                >
                  {t('save')}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setRenaming(null)}>
                  {t('cancel')}
                </Button>
              </li>
            ) : (
              <li
                key={g.id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
              >
                <span>{pick(g.name, locale)}</span>
                <span className="flex items-center gap-3">
                  <span className="text-sm text-ink-muted">
                    {t('areaCount', { count: g.areas.length })}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setRenaming({ id: g.id, nameAr: g.name.ar ?? '', nameEn: g.name.en ?? '' })
                    }
                  >
                    {t('rename')}
                  </Button>
                </span>
              </li>
            ),
          )}
        </ul>
      </Card>
      <Card>
        {create.isError ? (
          <Alert tone="error" className="mb-3">
            {errorMessage(create.error)}
          </Alert>
        ) : null}
        <form
          className="grid items-end gap-3 sm:grid-cols-4"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <TextField
            label={t('key')}
            hint={t('keyHint')}
            value={form.key ?? slugKey(form.nameEn)}
            onChange={(e) => setForm((f) => ({ ...f, key: e.target.value }))}
            dir="ltr"
            required
          />
          <TextField
            label={t('nameAr')}
            value={form.nameAr}
            onChange={(e) => setForm((f) => ({ ...f, nameAr: e.target.value }))}
            dir="rtl"
            lang="ar"
            required
          />
          <TextField
            label={t('nameEn')}
            value={form.nameEn}
            onChange={(e) => setForm((f) => ({ ...f, nameEn: e.target.value }))}
            dir="ltr"
            lang="en"
          />
          <Button type="submit" busy={create.isPending}>
            {t('addGovernorate')}
          </Button>
        </form>
      </Card>
    </section>
  );
}

function AreasSection({ catalog }: { catalog: Catalog }) {
  const t = useTranslations('admin.geography');
  const tt = useTranslations('common.toast');
  const locale = useLocale();
  const api = useApi();
  const queryClient = useQueryClient();
  const errorMessage = useErrorMessage();
  const [governorateId, setGovernorateId] = useState(catalog.governorates[0]?.id ?? '');
  const [form, setForm] = useState<{ key: string | null; nameAr: string; nameEn: string }>({
    key: null,
    nameAr: '',
    nameEn: '',
  });
  const [renaming, setRenaming] = useState<{ id: string; nameAr: string; nameEn: string } | null>(
    null,
  );
  const governorate = catalog.governorates.find((g) => g.id === governorateId);

  const create = useMutation({
    meta: { toast: tt('added') },
    mutationFn: () =>
      api(adminCreateArea, {
        params: { governorateId },
        body: {
          key: (form.key ?? slugKey(form.nameEn)).trim(),
          name: { ar: form.nameAr.trim(), en: form.nameEn.trim() },
        },
      }),
    onSuccess: (data) => {
      setCatalog(queryClient, data);
      setForm({ key: null, nameAr: '', nameEn: '' });
    },
  });
  const rename = useMutation({
    meta: { toast: tt('updated') },
    mutationFn: (input: { id: string; name: { ar: string; en: string } }) =>
      api(adminUpdateArea, { params: { areaId: input.id }, body: { name: input.name } }),
    onSuccess: (data) => {
      setCatalog(queryClient, data);
      setRenaming(null);
    },
  });

  return (
    <section>
      <h2 className="mb-3 font-display text-2xl leading-[1.35]">{t('areas')}</h2>
      <div className="mb-3 max-w-xs">
        <SelectField
          label={t('governorate')}
          value={governorateId}
          onChange={(e) => setGovernorateId(e.target.value)}
        >
          {catalog.governorates.map((g) => (
            <option key={g.id} value={g.id}>
              {pick(g.name, locale)}
            </option>
          ))}
        </SelectField>
      </div>
      <Card className="mb-4 p-0">
        <ul className="divide-y divide-line">
          {governorate?.areas.map((a) =>
            renaming?.id === a.id ? (
              <li key={a.id} className="flex flex-wrap items-end gap-3 px-5 py-3">
                <TextField
                  label={t('nameAr')}
                  value={renaming.nameAr}
                  onChange={(e) => setRenaming((r) => r && { ...r, nameAr: e.target.value })}
                  dir="rtl"
                  lang="ar"
                />
                <TextField
                  label={t('nameEn')}
                  value={renaming.nameEn}
                  onChange={(e) => setRenaming((r) => r && { ...r, nameEn: e.target.value })}
                  dir="ltr"
                  lang="en"
                />
                <Button
                  size="sm"
                  busy={rename.isPending}
                  onClick={() =>
                    rename.mutate({
                      id: a.id,
                      name: { ar: renaming.nameAr.trim(), en: renaming.nameEn.trim() },
                    })
                  }
                >
                  {t('save')}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setRenaming(null)}>
                  {t('cancel')}
                </Button>
              </li>
            ) : (
              <li
                key={a.id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
              >
                <span>{pick(a.name, locale)}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    setRenaming({ id: a.id, nameAr: a.name.ar ?? '', nameEn: a.name.en ?? '' })
                  }
                >
                  {t('rename')}
                </Button>
              </li>
            ),
          )}
          {governorate && governorate.areas.length === 0 ? (
            <li className="px-5 py-3 text-ink-muted">{t('noAreas')}</li>
          ) : null}
        </ul>
      </Card>
      <Card>
        {create.isError ? (
          <Alert tone="error" className="mb-3">
            {errorMessage(create.error)}
          </Alert>
        ) : null}
        <form
          className="grid items-end gap-3 sm:grid-cols-4"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <TextField
            label={t('key')}
            hint={t('keyHint')}
            value={form.key ?? slugKey(form.nameEn)}
            onChange={(e) => setForm((f) => ({ ...f, key: e.target.value }))}
            dir="ltr"
            required
          />
          <TextField
            label={t('nameAr')}
            value={form.nameAr}
            onChange={(e) => setForm((f) => ({ ...f, nameAr: e.target.value }))}
            dir="rtl"
            lang="ar"
            required
          />
          <TextField
            label={t('nameEn')}
            value={form.nameEn}
            onChange={(e) => setForm((f) => ({ ...f, nameEn: e.target.value }))}
            dir="ltr"
            lang="en"
          />
          <Button type="submit" busy={create.isPending} disabled={!governorateId}>
            {t('addArea')}
          </Button>
        </form>
      </Card>
    </section>
  );
}

const defaultSportForm = {
  key: null as string | null,
  nameAr: '',
  nameEn: '',
  icon: DEFAULT_SPORT_ICON,
  formatKey: null as string | null,
  formatNameAr: '',
  formatNameEn: '',
  minPlayers: '2',
  maxPlayers: '10',
  duration: '60',
  typeKey: null as string | null,
  typeNameAr: '',
  typeNameEn: '',
};

function SportsSection() {
  const t = useTranslations('admin.geography');
  const tc = useTranslations('common');
  const tt = useTranslations('common.toast');
  const locale = useLocale();
  const api = useApi();
  const queryClient = useQueryClient();
  const errorMessage = useErrorMessage();
  const [form, setForm] = useState(defaultSportForm);
  // All sports, including hidden ones (the public catalog only has the active ones).
  const sports = useQuery({ queryKey: ['admin-sports'], queryFn: () => api(adminListSports) });
  const refreshSports = () => queryClient.invalidateQueries({ queryKey: ['admin-sports'] });
  const toggle = useMutation({
    meta: { toast: tt('updated') },
    mutationFn: (input: { id: string; active: boolean }) =>
      api(adminUpdateSport, { params: { sportId: input.id }, body: { active: input.active } }),
    onSuccess: async (data) => {
      setCatalog(queryClient, data);
      await refreshSports();
    },
  });
  const [renaming, setRenaming] = useState<{
    id: string;
    nameAr: string;
    nameEn: string;
    icon: string;
  } | null>(null);

  const create = useMutation({
    meta: { toast: tt('added') },
    mutationFn: () =>
      api(adminCreateSport, {
        body: {
          key: (form.key ?? slugKey(form.nameEn)).trim(),
          name: { ar: form.nameAr.trim(), en: form.nameEn.trim() },
          icon: form.icon,
          format: {
            key: (form.formatKey ?? slugKey(form.formatNameEn)).trim(),
            name: { ar: form.formatNameAr.trim(), en: form.formatNameEn.trim() },
            minPlayers: Number(form.minPlayers),
            maxPlayers: Number(form.maxPlayers),
            defaultDurationMinutes: Number(form.duration),
          },
          resourceType: {
            key: (form.typeKey ?? slugKey(form.typeNameEn)).trim(),
            name: { ar: form.typeNameAr.trim(), en: form.typeNameEn.trim() },
          },
        },
      }),
    onSuccess: (data) => {
      setCatalog(queryClient, data);
      void refreshSports();
      setForm(defaultSportForm);
    },
  });
  const rename = useMutation({
    meta: { toast: tt('updated') },
    mutationFn: (input: { id: string; name: { ar: string; en: string }; icon: string }) =>
      api(adminUpdateSport, {
        params: { sportId: input.id },
        body: { name: input.name, icon: input.icon },
      }),
    onSuccess: (data) => {
      setCatalog(queryClient, data);
      void refreshSports();
      setRenaming(null);
    },
  });

  return (
    <section>
      <h2 className="mb-3 font-display text-2xl leading-[1.35]">{t('sports')}</h2>
      <p className="mb-3 text-sm text-ink-muted">{t('sportsHint')}</p>
      {sports.isError ? (
        <Alert tone="error" className="mb-4">
          {errorMessage(sports.error)}
        </Alert>
      ) : null}
      <Card className="mb-4 p-0">
        {sports.isPending ? (
          <div className="p-4">
            <ListSkeleton label={tc('loading')} rows={4} thumb={false} />
          </div>
        ) : null}
        <ul className="divide-y divide-line">
          {(sports.data?.items ?? []).map((s) =>
            renaming?.id === s.id ? (
              <li key={s.id} className="flex flex-wrap items-end gap-3 px-5 py-3">
                <TextField
                  label={t('nameAr')}
                  value={renaming.nameAr}
                  onChange={(e) => setRenaming((r) => r && { ...r, nameAr: e.target.value })}
                  dir="rtl"
                  lang="ar"
                />
                <TextField
                  label={t('nameEn')}
                  value={renaming.nameEn}
                  onChange={(e) => setRenaming((r) => r && { ...r, nameEn: e.target.value })}
                  dir="ltr"
                  lang="en"
                />
                <div className="w-full">
                  <IconPicker
                    value={renaming.icon}
                    onChange={(icon) => setRenaming((r) => r && { ...r, icon })}
                  />
                </div>
                <Button
                  size="sm"
                  busy={rename.isPending}
                  onClick={() =>
                    rename.mutate({
                      id: s.id,
                      name: { ar: renaming.nameAr.trim(), en: renaming.nameEn.trim() },
                      icon: renaming.icon.trim(),
                    })
                  }
                >
                  {t('save')}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setRenaming(null)}>
                  {t('cancel')}
                </Button>
              </li>
            ) : (
              <li
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-5 py-3"
              >
                <span
                  className={cx('flex min-w-0 items-center gap-2', !s.active && 'text-ink-muted')}
                >
                  <SportIcon name={s.icon} className="size-5 shrink-0 text-primary" />
                  {pick(s.name, locale)}
                  <span className="ms-2 text-sm text-ink-muted">
                    {t('sportVenues', { count: s.venueCount })}
                    {s.active ? '' : ` · ${t('sportHidden')}`}
                  </span>
                </span>
                <span className="ms-auto flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    data-testid={`sport-toggle-${s.key}`}
                    busy={toggle.isPending && toggle.variables?.id === s.id}
                    onClick={() => toggle.mutate({ id: s.id, active: !s.active })}
                  >
                    {s.active ? t('hideSport') : t('showSport')}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setRenaming({
                        id: s.id,
                        nameAr: s.name.ar ?? '',
                        nameEn: s.name.en ?? '',
                        icon: s.icon,
                      })
                    }
                  >
                    {t('rename')}
                  </Button>
                </span>
              </li>
            ),
          )}
        </ul>
      </Card>
      <Card>
        {create.isError ? (
          <Alert tone="error" className="mb-3">
            {errorMessage(create.error)}
          </Alert>
        ) : null}
        <form
          className="grid gap-3 sm:grid-cols-3"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <h3 className="font-bold sm:col-span-3">{t('addSport')}</h3>
          <TextField
            label={t('key')}
            hint={t('keyHint')}
            value={form.key ?? slugKey(form.nameEn)}
            onChange={(e) => setForm((f) => ({ ...f, key: e.target.value }))}
            dir="ltr"
            required
          />
          <TextField
            label={t('nameAr')}
            value={form.nameAr}
            onChange={(e) => setForm((f) => ({ ...f, nameAr: e.target.value }))}
            dir="rtl"
            lang="ar"
            required
          />
          <TextField
            label={t('nameEn')}
            value={form.nameEn}
            onChange={(e) => setForm((f) => ({ ...f, nameEn: e.target.value }))}
            dir="ltr"
            lang="en"
          />
          <div className="sm:col-span-3">
            <IconPicker
              value={form.icon}
              onChange={(icon) => setForm((f) => ({ ...f, icon }))}
              hint={t('iconHint')}
            />
          </div>
          <h3 className="font-bold sm:col-span-3">{t('firstFormat')}</h3>
          <TextField
            label={t('key')}
            value={form.formatKey ?? slugKey(form.formatNameEn)}
            onChange={(e) => setForm((f) => ({ ...f, formatKey: e.target.value }))}
            dir="ltr"
            required
          />
          <TextField
            label={t('nameAr')}
            value={form.formatNameAr}
            onChange={(e) => setForm((f) => ({ ...f, formatNameAr: e.target.value }))}
            dir="rtl"
            lang="ar"
            required
          />
          <TextField
            label={t('nameEn')}
            value={form.formatNameEn}
            onChange={(e) => setForm((f) => ({ ...f, formatNameEn: e.target.value }))}
            dir="ltr"
            lang="en"
          />
          <TextField
            label={t('minPlayers')}
            type="number"
            min={1}
            value={form.minPlayers}
            onChange={(e) => setForm((f) => ({ ...f, minPlayers: e.target.value }))}
            dir="ltr"
            required
          />
          <TextField
            label={t('maxPlayers')}
            type="number"
            min={1}
            value={form.maxPlayers}
            onChange={(e) => setForm((f) => ({ ...f, maxPlayers: e.target.value }))}
            dir="ltr"
            required
          />
          <TextField
            label={t('duration')}
            type="number"
            min={15}
            step={5}
            value={form.duration}
            onChange={(e) => setForm((f) => ({ ...f, duration: e.target.value }))}
            dir="ltr"
            required
          />
          <h3 className="font-bold sm:col-span-3">{t('resourceType')}</h3>
          <TextField
            label={t('key')}
            value={form.typeKey ?? slugKey(form.typeNameEn)}
            onChange={(e) => setForm((f) => ({ ...f, typeKey: e.target.value }))}
            dir="ltr"
            required
          />
          <TextField
            label={t('nameAr')}
            value={form.typeNameAr}
            onChange={(e) => setForm((f) => ({ ...f, typeNameAr: e.target.value }))}
            dir="rtl"
            lang="ar"
            required
          />
          <TextField
            label={t('nameEn')}
            value={form.typeNameEn}
            onChange={(e) => setForm((f) => ({ ...f, typeNameEn: e.target.value }))}
            dir="ltr"
            lang="en"
          />
          <Button type="submit" busy={create.isPending} className="sm:col-span-3">
            {t('addSport')}
          </Button>
        </form>
      </Card>
    </section>
  );
}

/** Pick a sport's icon from the set players see (no icon keys to type). */
function IconPicker({
  value,
  onChange,
  hint,
}: {
  value: string;
  onChange: (icon: string) => void;
  hint?: string;
}) {
  const t = useTranslations('admin.geography');
  const names = useTranslations('admin.geography.iconNames');
  return (
    <fieldset>
      <legend className="mb-1 text-sm font-medium text-ink">{t('icon')}</legend>
      {hint ? <p className="mb-2 text-xs text-ink-muted">{hint}</p> : null}
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('icon')}>
        {SPORT_ICON_KEYS.map((key) => {
          const label = names.has(key as never) ? names(key as never) : key;
          const selected = key === value;
          return (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={label}
              title={label}
              data-testid={`icon-${key}`}
              onClick={() => onChange(key)}
              className={cx(
                'grid size-11 place-items-center rounded-tile border transition-colors',
                selected
                  ? 'border-primary bg-brand-50 text-primary'
                  : 'border-line bg-surface text-ink hover:border-line-strong',
              )}
            >
              <SportIcon name={key} className="size-6" />
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
