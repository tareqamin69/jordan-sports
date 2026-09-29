'use client';

import {
  adminGetSettings,
  adminUpdateSettings,
  type PlatformSettings,
} from '@jordan-sports/contracts';
import {
  Alert,
  Button,
  Card,
  CheckboxField,
  FormSkeleton,
  Ltr,
  PageHeader,
  SelectField,
  TextAreaField,
  TextField,
} from '@jordan-sports/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { useCan } from '@/lib/admin-session';
import { useApi } from '@/lib/api';
import { useErrorMessage } from '@/lib/use-error-message';

type Flag = 'default' | 'on' | 'off';
const toFlag = (v: boolean | null): Flag => (v === null ? 'default' : v ? 'on' : 'off');
const fromFlag = (f: Flag): boolean | null => (f === 'default' ? null : f === 'on');

interface Form {
  commissionPercent: string;
  supportWhatsapp: string;
  cliqPayments: Flag;
  venueEdits: boolean;
  allowlist: string;
}

function toForm(s: PlatformSettings): Form {
  return {
    commissionPercent: String(s.commissionBps / 100),
    supportWhatsapp: s.supportWhatsapp ?? '',
    cliqPayments: toFlag(s.features.cliqPayments),
    venueEdits: s.venueEditsNeedReview,
    allowlist: s.adminIpAllowlist.join('\n'),
  };
}

/** Platform settings (owner edits; admins read). Every change is audited on the server. */
export function SettingsPage() {
  const t = useTranslations('admin.settings');
  const tc = useTranslations('common');
  const api = useApi();
  const can = useCan();
  const queryClient = useQueryClient();
  const errorMessage = useErrorMessage();
  const settings = useQuery({ queryKey: ['settings'], queryFn: () => api(adminGetSettings) });
  const [form, setForm] = useState<Form | null>(null);
  const current = form ?? (settings.data ? toForm(settings.data) : null);
  const editable = can('settings.manage');
  const save = useMutation({
    meta: { toast: t('saved') },
    mutationFn: (f: Form) =>
      api(adminUpdateSettings, {
        body: {
          commissionBps: Math.round(Number(f.commissionPercent) * 100),
          supportWhatsapp: f.supportWhatsapp.trim() || null,
          venueEditsNeedReview: f.venueEdits,
          features: { cliqPayments: fromFlag(f.cliqPayments) },
          adminIpAllowlist: f.allowlist
            .split(/[\s,]+/)
            .map((x) => x.trim())
            .filter(Boolean),
        },
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(['settings'], data);
      setForm(null);
    },
  });

  if (settings.isError) return <Alert tone="error">{errorMessage(settings.error)}</Alert>;
  if (!current || !settings.data) return <FormSkeleton label={tc('loading')} fields={5} />;
  const set = (patch: Partial<Form>) => setForm({ ...current, ...patch });
  const percent = Number(current.commissionPercent);
  const percentValid = current.commissionPercent.trim() !== '' && percent >= 0 && percent <= 50;

  return (
    <>
      <PageHeader title={t('title')} description={t('description')} />
      {save.isError ? (
        <Alert tone="error" className="mb-4">
          {errorMessage(save.error)}
        </Alert>
      ) : null}
      {!editable ? (
        <Alert tone="info" className="mb-4">
          {t('readOnly')}
        </Alert>
      ) : null}
      <Card>
        <form
          className="flex flex-col gap-5"
          data-testid="settings-form"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            if (percentValid) save.mutate(current);
          }}
        >
          <TextField
            label={t('commission')}
            hint={t('commissionHint')}
            inputMode="decimal"
            dir="ltr"
            required
            disabled={!editable}
            value={current.commissionPercent}
            onChange={(e) => set({ commissionPercent: e.target.value })}
            error={percentValid ? undefined : t('commissionInvalid')}
            name="commissionPercent"
          />
          <TextField
            label={t('whatsapp')}
            hint={t('whatsappHint')}
            inputMode="tel"
            dir="ltr"
            disabled={!editable}
            value={current.supportWhatsapp}
            onChange={(e) => set({ supportWhatsapp: e.target.value })}
            name="supportWhatsapp"
          />
          <SelectField
            label={t('cliqPayments')}
            hint={t('flagHint', {
              value: settings.data.effectiveFeatures.cliqPayments ? t('on') : t('off'),
            })}
            disabled={!editable}
            value={current.cliqPayments}
            onChange={(e) => set({ cliqPayments: e.target.value as Flag })}
            name="cliqPayments"
          >
            <option value="default">{t('flagDefault')}</option>
            <option value="on">{t('on')}</option>
            <option value="off">{t('off')}</option>
          </SelectField>
          <CheckboxField
            label={`${t('venueEdits')} — ${t('venueEditsHint')}`}
            disabled={!editable}
            checked={current.venueEdits}
            onChange={(e) => set({ venueEdits: e.target.checked })}
            name="venueEdits"
          />
          <TextAreaField
            label={t('allowlist')}
            hint={t('allowlistHint')}
            dir="ltr"
            rows={3}
            disabled={!editable}
            value={current.allowlist}
            onChange={(e) => set({ allowlist: e.target.value })}
            name="allowlist"
          />
          <p className="text-sm text-ink-muted">
            {t('yourIp')} <Ltr>{settings.data.yourIp ?? '—'}</Ltr>
          </p>
          {editable ? (
            <div>
              <Button type="submit" busy={save.isPending} disabled={form === null}>
                {tc('actions.save')}
              </Button>
            </div>
          ) : null}
        </form>
      </Card>
    </>
  );
}
