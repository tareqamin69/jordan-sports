'use client';

import { adminSignIn } from '@jordan-sports/contracts';
import { Alert, Button, Card, TextField } from '@jordan-sports/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { useRouter } from '@/i18n/navigation';
import { useApi } from '@/lib/api';
import { useErrorMessage } from '@/lib/use-error-message';

export function AdminSignIn() {
  const t = useTranslations('admin.signIn');
  const tc = useTranslations('common.actions');
  const api = useApi();
  const router = useRouter();
  const queryClient = useQueryClient();
  const errorMessage = useErrorMessage();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const me = await api(adminSignIn, { body: { email, password, totpCode } });
      queryClient.setQueryData(['admin-me'], me);
      router.replace('/');
    } catch (err) {
      setError(errorMessage(err));
      setTotpCode('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="mx-auto w-full max-w-md">
      <form onSubmit={submit} className="flex flex-col gap-5">
        <h1 className="font-display text-[2rem] leading-[1.2]">{t('title')}</h1>
        {error ? <Alert tone="error">{error}</Alert> : null}
        <TextField
          label={t('email')}
          type="email"
          autoComplete="username"
          dir="ltr"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          name="email"
        />
        <TextField
          label={t('password')}
          type="password"
          autoComplete="current-password"
          dir="ltr"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          name="password"
        />
        <TextField
          label={t('totp')}
          hint={t('totpHint')}
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
          {tc('signIn')}
        </Button>
      </form>
    </Card>
  );
}
