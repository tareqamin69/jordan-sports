'use client';

import {
  cancelMockCheckout,
  getMockCheckout,
  payMockCheckout,
  type MockCheckout,
} from '@jordan-sports/contracts';
import { formatMoney } from '@jordan-sports/money';
import { Alert, Button, Card, FormSkeleton, TextField } from '@jordan-sports/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState, type FormEvent } from 'react';
import { useApi } from '@/lib/api';
import { useErrorMessage } from '@/lib/use-error-message';
import { Icon } from './icons';

/** Brand names, not copy. */
const CARD_BRANDS = ['VISA', 'Mastercard'];

const CARDS = [
  { number: '4242 4242 4242 4242', key: 'cardOk' },
  { number: '5555 5555 5555 4444', key: 'cardOk' },
  { number: '4000 0000 0000 0002', key: 'cardDeclined' },
  { number: '4000 0000 0000 9995', key: 'cardFunds' },
] as const;

/** The mock gateway's payment page: a card form that accepts only test cards. */
export function TestPayment({ sessionId }: { sessionId: string }) {
  const t = useTranslations('web.testPay');
  const locale = useLocale();
  const api = useApi();
  const errorMessage = useErrorMessage();
  const [number, setNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvc, setCvc] = useState('');
  const session = useQuery({
    queryKey: ['mock-checkout', sessionId],
    queryFn: () => api(getMockCheckout, { params: { sessionId } }),
    retry: false,
  });
  const [result, setResult] = useState<MockCheckout | null>(null);
  const pay = useMutation({
    mutationFn: () =>
      api(payMockCheckout, { params: { sessionId }, body: { number, expiry, cvc } }),
    onSuccess: setResult,
  });
  const back = useMutation({
    mutationFn: () => api(cancelMockCheckout, { params: { sessionId } }),
    onSuccess: setResult,
  });

  // Like a real hosted page: once the attempt is over, back to the booking.
  const s = result ?? session.data;
  const finished = s && s.status !== 'pending';
  useEffect(() => {
    if (finished) window.location.assign(s.returnUrl);
  }, [finished, s]);

  if (session.isPending) return <FormSkeleton label={t('title')} fields={3} />;
  if (session.isError || !s) return <Alert tone="error">{t('missing')}</Alert>;
  const invalid =
    s.status === 'pending' &&
    s.failureCode &&
    s.failureCode in { invalid_card: 1, invalid_expiry: 1, invalid_cvc: 1 }
      ? t(`invalid.${s.failureCode as 'invalid_card' | 'invalid_expiry' | 'invalid_cvc'}`)
      : null;

  return (
    <div className="flex animate-rise flex-col gap-4">
      <Alert tone="warning" data-testid="test-mode">
        {t('testMode')}
      </Alert>
      <Card className="flex flex-col gap-5 p-6">
        <div className="flex items-center justify-between gap-3">
          <h1 className="flex items-center gap-2 font-display text-2xl">
            <Icon name="lock" className="size-5 text-primary" />
            {t('title')}
          </h1>
          <span className="flex gap-1 text-xs font-bold text-ink-muted" dir="ltr">
            {CARD_BRANDS.map((brand) => (
              <span key={brand} className="rounded bg-canvas px-1.5 py-0.5">
                {brand}
              </span>
            ))}
          </span>
        </div>
        <p className="flex items-baseline justify-between rounded-2xl bg-canvas px-4 py-3">
          <span className="text-sm text-ink-muted">{s.description}</span>
          <span className="text-xl font-bold text-primary" data-testid="test-pay-amount">
            {formatMoney(s.amount, locale)}
          </span>
        </p>
        {invalid ? <Alert tone="error">{invalid}</Alert> : null}
        {pay.isError ? <Alert tone="error">{errorMessage(pay.error)}</Alert> : null}
        {finished ? <p className="text-sm text-ink-muted">{t('done')}</p> : null}
        <form
          className="flex flex-col gap-4"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            pay.mutate();
          }}
        >
          <TextField
            label={t('cardNumber')}
            name="cardNumber"
            inputMode="numeric"
            autoComplete="off"
            dir="ltr"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            required
          />
          <div className="grid grid-cols-2 gap-3">
            <TextField
              label={t('expiry')}
              name="expiry"
              placeholder="12/28"
              autoComplete="off"
              dir="ltr"
              value={expiry}
              onChange={(e) => setExpiry(e.target.value)}
              required
            />
            <TextField
              label={t('cvc')}
              name="cvc"
              inputMode="numeric"
              autoComplete="off"
              dir="ltr"
              maxLength={4}
              value={cvc}
              onChange={(e) => setCvc(e.target.value)}
              required
            />
          </div>
          <Button type="submit" size="lg" busy={pay.isPending} disabled={Boolean(finished)}>
            {t('pay', { amount: formatMoney(s.amount, locale) })}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="self-center"
            onClick={() => back.mutate()}
            busy={back.isPending}
            disabled={Boolean(finished)}
          >
            {t('back')}
          </Button>
        </form>
      </Card>
      <Card className="p-5">
        <h2 className="mb-2 text-sm font-semibold">{t('testCards')}</h2>
        <ul className="flex flex-col gap-1.5 text-sm">
          {CARDS.map((c) => (
            <li key={c.number} className="flex items-center justify-between gap-3">
              <button
                type="button"
                className="pressable rounded-lg px-2 py-1 font-mono text-primary hover:bg-canvas"
                dir="ltr"
                onClick={() => {
                  setNumber(c.number);
                  setExpiry('12/30');
                  setCvc('123');
                }}
              >
                {c.number}
              </button>
              <span className="text-ink-muted">{t(c.key)}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
