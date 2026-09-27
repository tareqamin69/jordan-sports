'use client';

import {
  adminCreateHoliday,
  adminDeleteHoliday,
  adminListHolidays,
} from '@jordan-sports/contracts';
import { Alert, Button, Card, PageHeader, Spinner, TextField } from '@jordan-sports/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { useApi } from '@/lib/api';
import { dmy } from '@/lib/format';
import { pick } from '@/lib/localized';
import { useErrorMessage } from '@/lib/use-error-message';

export function HolidaysPage() {
  const t = useTranslations('admin.holidays');
  const tc = useTranslations('common');
  const locale = useLocale();
  const api = useApi();
  const queryClient = useQueryClient();
  const errorMessage = useErrorMessage();
  const list = useQuery({
    queryKey: ['holidays'],
    queryFn: () => api(adminListHolidays, { query: { country: 'JO' } }),
  });
  const [form, setForm] = useState({ date: '', nameAr: '', nameEn: '' });
  const add = useMutation({
    mutationFn: () =>
      api(adminCreateHoliday, {
        body: {
          countryCode: 'JO',
          date: form.date,
          name: {
            ...(form.nameAr.trim() ? { ar: form.nameAr.trim() } : {}),
            ...(form.nameEn.trim() ? { en: form.nameEn.trim() } : {}),
          },
        },
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(['holidays'], data);
      setForm({ date: '', nameAr: '', nameEn: '' });
    },
  });
  const remove = useMutation({
    mutationFn: (holidayId: string) => api(adminDeleteHoliday, { params: { holidayId } }),
    onSuccess: (data) => queryClient.setQueryData(['holidays'], data),
  });
  const error = add.error ?? remove.error ?? list.error;

  return (
    <>
      <PageHeader title={t('title')} description={t('description')} />
      {error ? (
        <Alert tone="error" className="mb-4">
          {errorMessage(error)}
        </Alert>
      ) : null}
      <Card className="mb-6">
        <form
          className="grid items-end gap-4 sm:grid-cols-4"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            add.mutate();
          }}
        >
          <TextField
            label={t('date')}
            type="date"
            required
            value={form.date}
            onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
            dir="ltr"
          />
          <TextField
            label={t('nameAr')}
            value={form.nameAr}
            onChange={(e) => setForm((f) => ({ ...f, nameAr: e.target.value }))}
            dir="rtl"
            lang="ar"
          />
          <TextField
            label={t('nameEn')}
            value={form.nameEn}
            onChange={(e) => setForm((f) => ({ ...f, nameEn: e.target.value }))}
            dir="ltr"
            lang="en"
          />
          <Button type="submit" busy={add.isPending}>
            {t('add')}
          </Button>
        </form>
      </Card>
      {list.isPending ? <Spinner label={tc('loading')} /> : null}
      {list.data?.items.length === 0 ? <p className="text-ink-muted">{t('empty')}</p> : null}
      <Card className="p-0">
        <ul className="divide-y divide-line">
          {list.data?.items.map((h) => (
            <li key={h.id} className="flex items-center justify-between gap-3 px-5 py-3">
              <span>
                <span className="font-medium">{dmy(h.date)}</span>
                {' · '}
                {pick(h.name, locale)}
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => remove.mutate(h.id)}
                busy={remove.isPending && remove.variables === h.id}
              >
                {t('remove')}
              </Button>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
