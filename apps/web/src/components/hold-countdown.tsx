import { cx } from '@jordan-sports/ui';
import type { ReactNode } from 'react';

const R = 9;
const C = 2 * Math.PI * R;

/**
 * The held-time countdown: a ring that empties as the hold runs out (clay in the last minute)
 * next to the "held for m:ss" text.
 */
export function HoldCountdown({
  holdLeft,
  total,
  children,
  className,
}: {
  /** Milliseconds left. */
  holdLeft: number;
  /** The hold's full length in milliseconds (expiry − creation). */
  total: number;
  children: ReactNode;
  className?: string;
}) {
  const fraction = total > 0 ? Math.min(1, Math.max(0, holdLeft / total)) : 0;
  const urgent = holdLeft < 60_000;
  return (
    <span
      data-testid="hold-countdown"
      className={cx(
        'flex min-h-12 w-fit min-w-0 items-center gap-2 rounded-full bg-accent-300/60 py-1 pe-4 ps-2 text-sm font-medium leading-tight text-ink tabular-nums',
        className,
      )}
    >
      <svg viewBox="0 0 24 24" className="size-8 shrink-0 -rotate-90" aria-hidden>
        <circle
          cx="12"
          cy="12"
          r={R}
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.12"
          strokeWidth="3"
        />
        <circle
          cx="12"
          cy="12"
          r={R}
          fill="none"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - fraction)}
          className={cx(
            'transition-[stroke-dashoffset] duration-1000 ease-linear',
            urgent ? 'animate-pulse stroke-danger' : 'stroke-clay',
          )}
        />
      </svg>
      <span className={cx(urgent && 'text-danger')}>{children}</span>
    </span>
  );
}
