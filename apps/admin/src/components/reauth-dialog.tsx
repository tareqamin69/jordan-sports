'use client';

import { adminReauth } from '@jordan-sports/contracts/web';
import { Alert, Button, Card, TextField } from '@jordan-sports/ui';
import { useTranslations } from 'next-intl';
import { useEffect, useState, type FormEvent } from 'react';
import { useRawApi } from '@/lib/api';
import { onReauthRequest } from '@/lib/reauth';
import { useErrorMessage } from '@/lib/use-error-message';

/** Asks for the password and authenticator code again before a dangerous action. */
export function ReauthDialog() {
  const t = useTranslations('admin.reauth');
  const ts = useTranslations('admin.signIn');
  const api = useRawApi();
  const errorMessage = useErrorMessage();
  const [request, setRequest] = useState<{ resolve: (ok: boolean) => void } | null>(null);
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(
    () =>
      onReauthRequest((r) => {
        setRequest(r);
        setPassword('');
        setTotpCode('');
        setError(null);
      }),
    [],
  );

  if (!request) return null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(adminReauth, { body: { password, totpCode } });
      request.resolve(true);
    } catch (err) {
      setError(errorMessage(err));
      setTotpCode('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-night/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reauth-title"
      data-testid="reauth-dialog"
    >
      <Card className="w-full max-w-md">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <h2 id="reauth-title" className="font-display text-2xl">
            {t('title')}
          </h2>
          <p className="text-sm text-ink-muted">{t('intro')}</p>
          {error ? <Alert tone="error">{error}</Alert> : null}
          <TextField
            label={ts('password')}
            type="password"
            autoComplete="current-password"
            dir="ltr"
            required
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            name="reauthPassword"
          />
          <TextField
            label={ts('totp')}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            dir="ltr"
            required
            value={totpCode}
            onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
            name="reauthCode"
          />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" busy={busy}>
              {t('confirm')}
            </Button>
            <Button type="button" variant="secondary" onClick={() => request.resolve(false)}>
              {t('cancel')}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
