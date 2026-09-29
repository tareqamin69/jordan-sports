'use client';

import { cx } from '@jordan-sports/ui';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from './icons';

const THRESHOLD = 72;

/**
 * Pull-to-refresh for touch screens: pulling down at the top of the page shows an arrow that turns
 * into a spinner and calls `onRefresh`. Mouse/keyboard users are unaffected.
 */
export function PullToRefresh({
  onRefresh,
  label,
  children,
}: {
  onRefresh: () => Promise<unknown>;
  label: string;
  children: ReactNode;
}) {
  const [pull, setPull] = useState(0);
  const [busy, setBusy] = useState(false);
  const start = useRef<number | null>(null);
  const pullRef = useRef(0);
  const refresh = useRef(onRefresh);
  useEffect(() => {
    refresh.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    const down = (e: TouchEvent) => {
      start.current = window.scrollY <= 0 ? e.touches[0]!.clientY : null;
    };
    const move = (e: TouchEvent) => {
      if (start.current === null) return;
      const dy = e.touches[0]!.clientY - start.current;
      pullRef.current = dy > 0 ? Math.min(110, dy * 0.5) : 0;
      setPull(pullRef.current);
    };
    const up = async () => {
      const reached = pullRef.current >= THRESHOLD * 0.75;
      start.current = null;
      pullRef.current = 0;
      setPull(0);
      if (!reached) return;
      setBusy(true);
      try {
        await refresh.current();
      } finally {
        setBusy(false);
      }
    };
    window.addEventListener('touchstart', down, { passive: true });
    window.addEventListener('touchmove', move, { passive: true });
    window.addEventListener('touchend', up);
    return () => {
      window.removeEventListener('touchstart', down);
      window.removeEventListener('touchmove', move);
      window.removeEventListener('touchend', up);
    };
  }, []);

  const shown = busy ? THRESHOLD * 0.6 : pull;
  return (
    <div className="relative">
      <div
        aria-hidden={!busy}
        role={busy ? 'status' : undefined}
        className={cx(
          'pointer-events-none absolute inset-x-0 -top-2 z-10 flex justify-center',
          !pull && 'transition-transform duration-base ease-soft',
        )}
        style={{ transform: `translateY(${shown - 44}px)`, opacity: shown ? 1 : 0 }}
      >
        <span className="grid size-10 place-items-center rounded-full bg-surface text-primary shadow-lift">
          {busy ? (
            <span className="size-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          ) : (
            <Icon
              name="arrow"
              className="size-5 rotate-90"
              style={{ transform: `rotate(${90 + Math.min(1, pull / THRESHOLD) * 180}deg)` }}
            />
          )}
          {busy ? <span className="sr-only">{label}</span> : null}
        </span>
      </div>
      {children}
    </div>
  );
}
