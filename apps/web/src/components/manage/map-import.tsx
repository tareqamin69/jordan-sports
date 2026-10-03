'use client';

import { ApiError, importMyVenueFromMap, type VenueImport } from '@jordan-sports/contracts/web';
import { Alert, Button, TextField } from '@jordan-sports/ui';
import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { useApi } from '@/lib/api';
import { useErrorMessage } from '@/lib/use-error-message';

/**
 * Optional first field of the registration wizard: a Google Maps link pre-fills what it can (name,
 * pin, governorate/area; with the Places key also phone, address and hours). Never a dead end: any
 * failure is a soft note and the manual form below carries on as usual. Photos are never copied.
 */
export function MapImport({ onImported }: { onImported: (data: VenueImport) => void }) {
  const t = useTranslations('web.manage.register');
  const api = useApi();
  const errorMessage = useErrorMessage();
  const [url, setUrl] = useState('');
  const read = useMutation({
    mutationFn: () => api(importMyVenueFromMap, { body: { url: url.trim() } }),
    onSuccess: onImported,
  });

  return (
    <form
      className="flex flex-col gap-3 rounded-card border border-dashed border-line p-4 sm:col-span-2"
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
            inputMode="url"
            dir="ltr"
            name="mapLink"
            placeholder="https://maps.app.goo.gl/…"
          />
        </div>
        <Button
          type="submit"
          variant="secondary"
          busy={read.isPending}
          disabled={url.trim().length < 8}
          className="sm:mb-6"
          data-testid="map-import-read"
        >
          {t('mapLinkRead')}
        </Button>
      </div>
      {read.isSuccess ? (
        <Alert tone="success" data-testid="map-import-done">
          {read.data.source === 'places' ? t('mapLinkDonePlaces') : t('mapLinkDone')}{' '}
          {t('mapLinkPhotos')}
        </Alert>
      ) : null}
      {read.isError ? (
        <Alert tone="info" data-testid="map-import-failed">
          {read.error instanceof ApiError && read.error.code === 'MAP_LINK_UNREADABLE'
            ? errorMessage(read.error)
            : t('mapLinkFailed')}
        </Alert>
      ) : null}
    </form>
  );
}
