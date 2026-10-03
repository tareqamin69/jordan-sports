'use client';

import { completeAccountSetup, inspectAccountSetup } from '@jordan-sports/contracts/web';
import { Alert, Button, Card, FormSkeleton, Ltr, TextField } from '@jordan-sports/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import QRCode from 'qrcode';
import { useState, useSyncExternalStore, type FormEvent } from 'react';
import { useRouter } from '@/i18n/navigation';
import { useRawApi } from '@/lib/api';
import { useErrorMessage } from '@/lib/use-error-message';

/** Reads the one-time token from the URL fragment (never sent to servers or logged). */
function tokenFromHash(): string | null {
  if (typeof window === 'undefined') return null;
  const match = /(?:^#|&)token=([A-Za-z0-9_-]{20,200})/.exec(window.location.hash);
  return match ? match[1]! : null;
}

const noSubscribe = () => () => undefined;

/** One-time staff account setup: choose a password and enrol an authenticator app. */
export function AccountSetupForm() {
  const t = useTranslations('admin.setup');
  const tr = useTranslations('admin.roles');
  const tc = useTranslations('common');
  const format = useFormatter();
  const api = useRawApi();
  const router = useRouter();
  const queryClient = useQueryClient();
  const errorMessage = useErrorMessage();
  const token = useSyncExternalStore(noSubscribe, tokenFromHash, () => undefined);
  const setup = useQuery({
    queryKey: ['account-setup', token],
    enabled: typeof token === 'string',
    retry: false,
    staleTime: Infinity,
    queryFn: async () => {
      const d = await api(inspectAccountSetup, { body: { token: token! } });
      const qr = await QRCode.toDataURL(d.otpauthUri, { margin: 1, width: 220 });
      return { details: d, qr };
    },
  });
  const details = setup.data?.details ?? null;
  const qr = setup.data?.qr ?? null;
  const loadError = setup.isError ? errorMessage(setup.error) : null;
  const [nameInput, setName] = useState<string | null>(null);
  const name = nameInput ?? details?.displayName ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!token) return;
    if (password !== confirm) {
      setError(t('mismatch'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const me = await api(completeAccountSetup, {
        body: { token, displayName: name, password, totpCode },
      });
      // The link is spent: remove it from the address bar and history.
      window.history.replaceState(null, '', window.location.pathname);
      queryClient.setQueryData(['admin-me'], me);
      router.replace('/');
    } catch (err) {
      setError(errorMessage(err));
      setTotpCode('');
    } finally {
      setBusy(false);
    }
  };

  if (token === undefined || (token && !details && !loadError)) {
    return <FormSkeleton label={tc('loading')} fields={3} />;
  }
  if (!token || loadError || !details) {
    return (
      <Card className="mx-auto w-full max-w-md">
        <Alert tone="error">{loadError ?? t('missing')}</Alert>
      </Card>
    );
  }

  return (
    <Card className="mx-auto w-full max-w-lg">
      <form onSubmit={submit} className="flex flex-col gap-5" data-testid="account-setup">
        <h1 className="font-display text-[2rem] leading-[1.3]">{t('title')}</h1>
        <p className="text-sm text-ink-muted">{t('intro')}</p>
        <p className="text-sm">
          <Ltr>{details.email}</Ltr> · {t('role', { role: tr(details.platformRole) })}
          <br />
          {t('expires', {
            time: format.dateTime(new Date(details.expiresAt), {
              hour: 'numeric',
              minute: '2-digit',
            }),
          })}
        </p>
        {error ? <Alert tone="error">{error}</Alert> : null}
        <div className="flex flex-col gap-3">
          <p className="font-medium">{t('step1')}</p>
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt="" width={220} height={220} className="rounded-lg bg-white p-2" />
          ) : null}
          <p className="text-sm text-ink-muted">{t('manual')}</p>
          <code
            dir="ltr"
            className="break-all rounded-md bg-canvas-deep p-2 text-sm"
            data-testid="totp-secret"
          >
            {details.totpSecret}
          </code>
        </div>
        <p className="font-medium">{t('step2')}</p>
        <TextField
          label={t('name')}
          required
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
          name="displayName"
        />
        <TextField
          label={t('password')}
          type="password"
          autoComplete="new-password"
          dir="ltr"
          required
          minLength={12}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          name="password"
        />
        <TextField
          label={t('confirm')}
          type="password"
          autoComplete="new-password"
          dir="ltr"
          required
          minLength={12}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          name="confirm"
        />
        <p className="font-medium">{t('step3')}</p>
        <TextField
          label={t('step3')}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          dir="ltr"
          required
          value={totpCode}
          onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
          name="totpCode"
        />
        <Button type="submit" busy={busy}>
          {t('submit')}
        </Button>
      </form>
    </Card>
  );
}
