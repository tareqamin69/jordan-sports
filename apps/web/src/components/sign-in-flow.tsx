'use client';

import {
  completeSignup,
  requestOtp,
  verifyOtp,
  type PreferredMode,
} from '@jordan-sports/contracts';
import { Alert, Button, Card, CheckboxField, Ltr, TextField } from '@jordan-sports/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { useRouter } from '@/i18n/navigation';
import { useApi } from '@/lib/api';
import { useErrorMessage } from '@/lib/use-error-message';
import { HeroArt } from './court-art';
import { Icon } from './icons';

type Step =
  | { name: 'phone' }
  | { name: 'code'; phone: string }
  | { name: 'profile'; signupToken: string }
  | { name: 'mode'; signupToken: string };

/** Only same-site paths are accepted as a return address (no open redirects). */
function safeNext(next: string | undefined, fallback: string): string {
  return next && /^\/(?![/\\])[\w\-/?=&%.]*$/.test(next) ? next : fallback;
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
  // Test builds only (no SMS provider yet): the code is shown on screen.
  const [testCode, setTestCode] = useState<string | null>(null);

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

  async function finish(fallback: string) {
    await queryClient.invalidateQueries({ queryKey: ['me'] });
    router.replace(safeNext(next, fallback));
  }

  const sendCode = (e?: FormEvent) => {
    e?.preventDefault();
    return run(async () => {
      const result = await api(requestOtp, { body: { phone } });
      setCode('');
      setTestCode(null);
      setStep({ name: 'code', phone: result.phone });
      if (devNotice) {
        const res = await fetch(`/api/v1/dev/otp?phone=${encodeURIComponent(result.phone)}`);
        if (res.ok) setTestCode(((await res.json()) as { code: string }).code);
      }
    });
  };

  const verify = (e: FormEvent) => {
    e.preventDefault();
    if (step.name !== 'code') return;
    return run(async () => {
      const result = await api(verifyOtp, { body: { phone: step.phone, code } });
      if (result.status === 'signed_in') await finish('/account');
      else setStep({ name: 'profile', signupToken: result.signupToken });
    });
  };

  const continueToMode = (e: FormEvent) => {
    e.preventDefault();
    if (step.name !== 'profile' || !ageConfirmed) return;
    setStep({ name: 'mode', signupToken: step.signupToken });
  };

  const chooseMode = (preferredMode: PreferredMode) => {
    if (step.name !== 'mode') return;
    return run(async () => {
      await api(completeSignup, {
        body: {
          signupToken: step.signupToken,
          displayName: name,
          locale,
          ageConfirmed: true,
          preferredMode,
        },
      });
      await finish(preferredMode === 'venue' ? '/manage' : '/');
    });
  };

  return (
    <Card className="mx-auto w-full max-w-md animate-rise overflow-hidden p-0">
      <div className="relative h-32 bg-night">
        <HeroArt className="absolute inset-0" />
        <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-night/0 to-night/70" />
      </div>
      <div className="p-6 sm:p-8">
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
            <h1 className="font-display text-[2rem] leading-[1.2]">{t('title')}</h1>
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
            <h1 className="font-display text-[2rem] leading-[1.2]">{t('codeTitle')}</h1>
            <p className="text-ink-muted">
              {t.rich('codeSentTo', { phone: () => <Ltr>{step.phone}</Ltr> })}
            </p>
            {testCode ? (
              <Alert tone="info">
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    {t('testCode')} <Ltr>{testCode}</Ltr>
                  </span>
                  <Button variant="secondary" size="sm" onClick={() => setCode(testCode)}>
                    {t('useTestCode')}
                  </Button>
                </span>
              </Alert>
            ) : null}
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
            <div className="-mx-2 flex flex-wrap justify-between gap-2">
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
          <form onSubmit={continueToMode} className="flex flex-col gap-5">
            <h1 className="font-display text-[2rem] leading-[1.2]">{t('profileTitle')}</h1>
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
            <Button type="submit" disabled={!ageConfirmed || name.trim() === ''}>
              {tc('continue')}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setStep({ name: 'phone' })}>
              {tc('back')}
            </Button>
          </form>
        ) : null}

        {step.name === 'mode' ? (
          <div className="flex flex-col gap-5">
            <h1 className="font-display text-[2rem] leading-[1.2]">{t('modeTitle')}</h1>
            <div className="flex flex-col gap-3">
              <button
                type="button"
                data-testid="mode-player"
                disabled={busy}
                onClick={() => void chooseMode('player')}
                className="flex items-start gap-4 rounded-tile border border-line bg-surface p-4 text-start transition-colors hover:border-primary hover:bg-brand-50 disabled:opacity-60"
              >
                <span className="grid size-11 shrink-0 place-items-center rounded-full bg-brand-50 text-primary">
                  <Icon name="calendar" className="size-5" />
                </span>
                <span className="flex flex-col gap-0.5">
                  <span className="font-semibold text-ink">{t('modePlayerTitle')}</span>
                  <span className="text-sm text-ink-muted">{t('modePlayerBody')}</span>
                </span>
              </button>
              <button
                type="button"
                data-testid="mode-venue"
                disabled={busy}
                onClick={() => void chooseMode('venue')}
                className="flex items-start gap-4 rounded-tile border border-line bg-surface p-4 text-start transition-colors hover:border-primary hover:bg-brand-50 disabled:opacity-60"
              >
                <span className="grid size-11 shrink-0 place-items-center rounded-full bg-brand-50 text-primary">
                  <Icon name="grid" className="size-5" />
                </span>
                <span className="flex flex-col gap-0.5">
                  <span className="font-semibold text-ink">{t('modeVenueTitle')}</span>
                  <span className="text-sm text-ink-muted">{t('modeVenueBody')}</span>
                </span>
              </button>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="self-start"
              onClick={() => setStep({ name: 'profile', signupToken: step.signupToken })}
            >
              {tc('back')}
            </Button>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
