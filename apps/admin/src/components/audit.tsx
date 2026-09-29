'use client';

import { adminListAuditLogs } from '@jordan-sports/contracts';
import {
  Alert,
  Button,
  Card,
  PageHeader,
  Spinner,
  TextField,
  buttonClass,
} from '@jordan-sports/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { useApi } from '@/lib/api';
import { dmyTime } from '@/lib/format';
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
          <TextField
            label={t('filters.action')}
            hint={t('filters.actionHint')}
            dir="ltr"
            value={draft.action}
            onChange={(e) => setDraft((d) => ({ ...d, action: e.target.value }))}
            name="auditAction"
          />
          <TextField
            label={t('filters.targetType')}
            dir="ltr"
            value={draft.targetType}
            onChange={(e) => setDraft((d) => ({ ...d, targetType: e.target.value }))}
            name="auditTargetType"
          />
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
      {logs.isPending ? <Spinner label={tc('loading')} /> : null}
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
                  <td className="px-4 py-3 font-mono text-xs" dir="ltr">
                    {entry.action}
                  </td>
                  <td className="px-4 py-3 text-xs text-ink-muted" dir="ltr">
                    {entry.targetType ?? ''}
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
