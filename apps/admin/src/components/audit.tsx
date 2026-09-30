'use client';

import { adminListAuditLogs } from '@jordan-sports/contracts';
import {
  Alert,
  Button,
  Card,
  ListSkeleton,
  PageHeader,
  SelectField,
  TextField,
  buttonClass,
} from '@jordan-sports/ui';
import { useQuery } from '@tanstack/react-query';
import { useLocale, useMessages, useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { useApi } from '@/lib/api';
import { dmyTime } from '@/lib/format';
import { pick } from '@/lib/localized';
import { useErrorMessage } from '@/lib/use-error-message';

interface Filters {
  action: string;
  targetType: string;
  targetId: string;
  from: string;
  to: string;
}
const EMPTY: Filters = { action: '', targetType: '', targetId: '', from: '', to: '' };

export function AuditPage() {
  const t = useTranslations('admin.audit');
  const tc = useTranslations('common');
  const api = useApi();
  const errorMessage = useErrorMessage();
  const locale = useLocale();
  const ta = useTranslations('admin.audit.actions');
  const tt = useTranslations('admin.audit.targets');
  // Action keys are dotted ("venue.updated"); message keys use an underscore.
  const actionLabel = (action: string) => {
    const key = action.replace(/\./g, '_');
    return ta.has(key as never) ? ta(key as never) : action;
  };
  const targetLabel = (type: string) => (tt.has(type as never) ? tt(type as never) : type);
  // Filters are picked from the labelled lists (plain words, not "venue.updated").
  const messages = useMessages() as unknown as {
    admin: { audit: { actions: Record<string, string>; targets: Record<string, string> } };
  };
  const actionOptions = Object.keys(messages.admin.audit.actions)
    .map((key) => ({ value: key.replace('_', '.'), label: ta(key as never) }))
    .sort((a, b) => a.label.localeCompare(b.label, locale));
  const targetOptions = [...new Set(Object.keys(messages.admin.audit.targets))]
    .filter((key) => key !== 'setting')
    .map((key) => ({ value: key, label: tt(key as never) }))
    .sort((a, b) => a.label.localeCompare(b.label, locale));
  const [draft, setDraft] = useState<Filters>(EMPTY);
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const query = Object.fromEntries(
    Object.entries(filters)
      .map(([k, v]) => [k, v.trim()])
      .filter(([, v]) => v !== ''),
  ) as Partial<Filters>;
  const logs = useQuery({
    queryKey: ['audit', query],
    queryFn: () => api(adminListAuditLogs, { query: { limit: 100, ...query } }),
  });
  const csvUrl = `/api/v1/admin/audit-logs.csv?${new URLSearchParams(query).toString()}`;

  return (
    <>
      <PageHeader title={t('title')} description={t('description')} />
      <Card className="mb-4">
        <form
          className="grid items-end gap-3 sm:grid-cols-3 lg:grid-cols-6"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            setFilters(draft);
          }}
        >
          <SelectField
            label={t('filters.action')}
            value={draft.action}
            onChange={(e) => setDraft((d) => ({ ...d, action: e.target.value }))}
            name="auditAction"
          >
            <option value="">{t('filters.anyAction')}</option>
            {actionOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </SelectField>
          <SelectField
            label={t('filters.targetType')}
            value={draft.targetType}
            onChange={(e) => setDraft((d) => ({ ...d, targetType: e.target.value }))}
            name="auditTargetType"
          >
            <option value="">{t('filters.anyTarget')}</option>
            {targetOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </SelectField>
          <TextField
            label={t('filters.targetId')}
            dir="ltr"
            value={draft.targetId}
            onChange={(e) => setDraft((d) => ({ ...d, targetId: e.target.value }))}
            name="auditTargetId"
          />
          <TextField
            label={t('filters.from')}
            type="date"
            dir="ltr"
            value={draft.from}
            onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))}
            name="auditFrom"
          />
          <TextField
            label={t('filters.to')}
            type="date"
            dir="ltr"
            value={draft.to}
            onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))}
            name="auditTo"
          />
          <div className="flex gap-2">
            <Button type="submit" variant="secondary">
              {tc('actions.search')}
            </Button>
            <a className={buttonClass({ variant: 'ghost' })} href={csvUrl} download>
              {t('filters.csv')}
            </a>
          </div>
        </form>
      </Card>
      {logs.isPending ? <ListSkeleton label={tc('loading')} rows={6} thumb={false} /> : null}
      {logs.isError ? <Alert tone="error">{errorMessage(logs.error)}</Alert> : null}
      {logs.data ? (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-start text-sm">
            <thead className="bg-canvas text-ink-muted">
              <tr>
                <th scope="col" className="px-4 py-3 text-start font-medium">
                  {t('when')}
                </th>
                <th scope="col" className="px-4 py-3 text-start font-medium">
                  {t('who')}
                </th>
                <th scope="col" className="px-4 py-3 text-start font-medium">
                  {t('action')}
                </th>
                <th scope="col" className="px-4 py-3 text-start font-medium">
                  {t('target')}
                </th>
                <th scope="col" className="px-4 py-3 text-start font-medium">
                  {t('reason')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {logs.data.items.map((entry) => (
                <tr key={entry.id}>
                  <td className="whitespace-nowrap px-4 py-3">
                    {dmyTime(new Date(entry.occurredAt))}
                  </td>
                  <td className="px-4 py-3">
                    {entry.actorName ?? (entry.actorType === 'system' ? t('system') : '—')}
                  </td>
                  <td className="px-4 py-3">
                    <span className="block font-medium">{actionLabel(entry.action)}</span>
                    <span className="block font-mono text-xs text-ink-muted" dir="ltr">
                      {entry.action}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {entry.targetName ? (
                      <span className="block">{pick(entry.targetName, locale)}</span>
                    ) : null}
                    <span className="block text-xs text-ink-muted">
                      {entry.targetType ? targetLabel(entry.targetType) : ''}
                    </span>
                  </td>
                  <td className="px-4 py-3">{entry.reason ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : null}
    </>
  );
}
