'use client';

import { adminListAuditLogs } from '@jordan-sports/contracts';
import { Alert, Card, PageHeader, Spinner } from '@jordan-sports/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useApi } from '@/lib/api';
import { dmyTime } from '@/lib/format';
import { useErrorMessage } from '@/lib/use-error-message';

export function AuditPage() {
  const t = useTranslations('admin.audit');
  const tc = useTranslations('common');
  const api = useApi();
  const errorMessage = useErrorMessage();
  const logs = useQuery({
    queryKey: ['audit'],
    queryFn: () => api(adminListAuditLogs, { query: { limit: 100 } }),
  });

  return (
    <>
      <PageHeader title={t('title')} description={t('description')} />
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
