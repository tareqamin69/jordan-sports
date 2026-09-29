'use client';

import { Button, buttonClass, cx } from '@jordan-sports/ui';
import { useTranslations } from 'next-intl';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { usePathname } from '@/i18n/navigation';
import { Icon } from './icons';

const DISMISSED_KEY = 'pwa-install-dismissed';
const VISITS_KEY = 'pwa-install-visits';
const BROWSE_DELAY_MS = 30_000;
const CHECKOUT_PATH = /^\/bookings\/[^/]+$/;

/** Minimal shape of the (non-standard, Chromium-only) BeforeInstallPromptEvent. */
interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (window.navigator as { standalone?: boolean }).standalone === true
  );
}

function dismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

function dismiss() {
  try {
    localStorage.setItem(DISMISSED_KEY, '1');
  } catch {
    // Private browsing or storage disabled: the prompt just reappears next visit, harmless.
  }
}

const noSubscription = () => () => {};
const serverSnapshotFalse = () => false;

/** Phones/small touch screens only — never desktop, whatever the browser thinks is installable. */
function useIsMobile(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia('(max-width: 767px)');
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    },
    () => window.matchMedia('(max-width: 767px)').matches,
    serverSnapshotFalse,
  );
}

function priorVisitRecorded(): boolean {
  try {
    return Number(localStorage.getItem(VISITS_KEY) ?? '0') >= 1;
  } catch {
    return false;
  }
}

/**
 * Never on a first-page-load: only once this is the visitor's 2nd visit (a prior visit already
 * recorded in localStorage, so it survives closing the tab) or they've spent 30s on this one.
 */
function useHasBrowsedEnough(): boolean {
  const isSecondVisit = useSyncExternalStore(
    noSubscription,
    priorVisitRecorded,
    serverSnapshotFalse,
  );
  const [timerFired, setTimerFired] = useState(false);
  useEffect(() => {
    try {
      localStorage.setItem(VISITS_KEY, '1');
    } catch {
      // Private browsing or storage disabled: falls back to the 30s timer every visit, harmless.
    }
    const id = setTimeout(() => setTimerFired(true), BROWSE_DELAY_MS);
    return () => clearTimeout(id);
  }, []);
  return isSecondVisit || timerFired;
}

/**
 * True once, for an iOS Safari visit that hasn't installed or dismissed the hint before. Read as
 * an external store (not effect + setState) so the client-only value never causes a hydration
 * mismatch: React renders the server snapshot (`false`, nothing to detect server-side) first,
 * then swaps in the real client snapshot right after hydrating.
 */
function useIosHintEligible(): boolean {
  return useSyncExternalStore(
    noSubscription,
    () => {
      if (isStandalone() || dismissed()) return false;
      const ua = window.navigator.userAgent;
      return /iphone|ipad|ipod/i.test(ua) && /safari/i.test(ua) && !/crios|fxios/i.test(ua);
    },
    serverSnapshotFalse,
  );
}

/**
 * A real "add to home screen" prompt: Android/Chrome gets the native install flow (triggered
 * from the actual `beforeinstallprompt` event — never shown speculatively, since that event only
 * fires once the browser has decided the app is installable); iOS Safari has no such API, so it
 * gets a one-time instructional hint instead (Apple's own "share → add to home screen" steps).
 * Hidden once installed, dismissed, or during checkout (never interrupts an active booking).
 */
export function InstallPrompt() {
  const t = useTranslations('web.pwa');
  const tc = useTranslations('common');
  const pathname = usePathname();
  const iosEligible = useIosHintEligible();
  const isMobile = useIsMobile();
  const hasBrowsedEnough = useHasBrowsedEnough();
  const [deferred, setDeferred] = useState<InstallEvent | null>(null);
  const [dismissedNow, setDismissedNow] = useState(false);

  useEffect(() => {
    if (isStandalone() || dismissed()) return;
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setDeferred(event as InstallEvent);
    };
    const onInstalled = () => {
      setDeferred(null);
      setDismissedNow(true);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const close = () => {
    dismiss();
    setDismissedNow(true);
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
  };

  const appName = tc('appName');
  const showIos = iosEligible && !deferred;
  const visible =
    (deferred || showIos) &&
    isMobile &&
    hasBrowsedEnough &&
    !dismissedNow &&
    !CHECKOUT_PATH.test(pathname);
  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label={t(deferred ? 'installTitle' : 'iosTitle', { appName })}
      className={cx(
        'fixed inset-x-4 z-30 mx-auto flex max-w-sm animate-rise items-start gap-3 rounded-card border border-line bg-surface p-4 shadow-float',
        'bottom-[calc(5.5rem+env(safe-area-inset-bottom))] md:inset-x-auto md:end-6 md:bottom-6',
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- static asset, no next/image benefit here */}
      <img src="/icons/icon-192.png" alt="" className="size-11 shrink-0 rounded-tile" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-ink">
          {t(deferred ? 'installTitle' : 'iosTitle', { appName })}
        </p>
        <p className="mt-0.5 text-sm text-ink-muted">
          {deferred
            ? t('installBody')
            : t.rich('iosBody', {
                appName,
                shareIcon: () => (
                  <Icon name="share" className="mx-1 inline size-4 align-text-bottom" />
                ),
              })}
        </p>
        <div className="mt-3 flex gap-2">
          {deferred ? (
            <Button size="sm" onClick={install}>
              {t('install')}
            </Button>
          ) : (
            <button type="button" onClick={close} className={buttonClass({ size: 'sm' })}>
              {t('gotIt')}
            </button>
          )}
          {deferred ? (
            <button
              type="button"
              onClick={close}
              className={buttonClass({ variant: 'ghost', size: 'sm' })}
            >
              {t('dismiss')}
            </button>
          ) : null}
        </div>
      </div>
      <button
        type="button"
        onClick={close}
        aria-label={t('dismiss')}
        className="grid size-8 shrink-0 place-items-center rounded-full text-ink-muted hover:bg-canvas hover:text-ink"
      >
        <Icon name="close" className="size-4" />
      </button>
    </div>
  );
}
