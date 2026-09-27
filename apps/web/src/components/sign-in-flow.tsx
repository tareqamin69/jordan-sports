'use client';

import { completeSignup, requestOtp, verifyOtp } from '@jordan-sports/contracts';
import { Alert, Button, Card, CheckboxField, Ltr, TextField } from '@jordan-sports/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { useRouter } from '@/i18n/navigation';
import { useApi } from '@/lib/api';
import { useErrorMessage } from '@/lib/use-error-message';

type Step =
  { name: 'phone' } | { name: 'code'; phone: string } | { name: 'profile'; signupToken: string };

/** Only same-site paths are accepted as a return address (no open redirects). */
function safeNext(next: string | undefined): string {
  return next && /^\/(?![/\\])[\w\-/?=&%.]*$/.test(next) ? next : '/account';
}

export function SignInFlow({ devNotice, next }: { devNotice: boolean; next?: string | undefined }) {
  const t = useTranslations('web.signIn');
  const tc = useTranslations('common.actions');
  const locale = useLocale() as 'ar' | 'en';
  const api = useApi();
  const router = useRouter();
  const queryClient = useQueryClient();
  const errorMessage = useErrorMessage();

  const [step, setStep] = useState<Step>({ name: 'phone' });
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    await queryClient.invalidateQueries({ queryKey: ['me'] });
    router.replace(safeNext(next));
  }

  const sendCode = (e?: FormEvent) => {
    e?.preventDefault();
    return run(async () => {
      const result = await api(requestOtp, { body: { phone } });
      setCode('');
      setStep({ name: 'code', phone: result.phone });
    });
  };

  const verify = (e: FormEvent) => {
    e.preventDefault();
    if (step.name !== 'code') return;
    return run(async () => {
      const result = await api(verifyOtp, { body: { phone: step.phone, code } });
      if (result.status === 'signed_in') await finish();
      else setStep({ name: 'profile', signupToken: result.signupToken });
    });
  };

  const createAccount = (e: FormEvent) => {
    e.preventDefault();
    if (step.name !== 'profile' || !ageConfirmed) return;
    return run(async () => {
      await api(completeSignup, {
        body: { signupToken: step.signupToken, displayName: name, locale, ageConfirmed: true },
      });
      await finish();
    });
  };

  return (
    <Card className="mx-auto w-full max-w-md">
      {devNotice ? (
        <Alert tone="warning" className="mb-5">
          {t('devNotice')}
        </Alert>
      ) : null}
      {error ? (
        <Alert tone="error" className="mb-5">
          {error}
        </Alert>
      ) : null}

      {step.name === 'phone' ? (
        <form onSubmit={sendCode} className="flex flex-col gap-5">
          <h1 className="text-xl font-bold">{t('title')}</h1>
          <TextField
            label={t('phoneLabel')}
            hint={t('phoneHint')}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            dir="ltr"
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            name="phone"
          />
          <Button type="submit" busy={busy}>
            {t('sendCode')}
          </Button>
        </form>
      ) : null}

      {step.name === 'code' ? (
        <form onSubmit={verify} className="flex flex-col gap-5">
          <h1 className="text-xl font-bold">{t('codeTitle')}</h1>
          <p className="text-ink-muted">
            {t.rich('codeSentTo', { phone: () => <Ltr>{step.phone}</Ltr> })}
          </p>
          <TextField
            label={t('codeLabel')}
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            dir="ltr"
            required
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            name="code"
          />
          <Button type="submit" busy={busy}>
            {t('verify')}
          </Button>
          <div className="flex flex-wrap justify-between gap-2">
            <Button variant="ghost" size="sm" onClick={() => setStep({ name: 'phone' })}>
              {t('changeNumber')}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void sendCode()} disabled={busy}>
              {t('resend')}
            </Button>
          </div>
        </form>
      ) : null}

      {step.name === 'profile' ? (
        <form onSubmit={createAccount} className="flex flex-col gap-5">
          <h1 className="text-xl font-bold">{t('profileTitle')}</h1>
          <TextField
            label={t('nameLabel')}
            hint={t('nameHint')}
            autoComplete="name"
            required
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
            name="displayName"
          />
          <CheckboxField
            label={t('ageConfirm')}
            checked={ageConfirmed}
            onChange={(e) => setAgeConfirmed(e.target.checked)}
            name="ageConfirmed"
          />
          <Button type="submit" busy={busy} disabled={!ageConfirmed || name.trim() === ''}>
            {t('createAccount')}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setStep({ name: 'phone' })}>
            {tc('back')}
          </Button>
        </form>
      ) : null}
    </Card>
  );
}
