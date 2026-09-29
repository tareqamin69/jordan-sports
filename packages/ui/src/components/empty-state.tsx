import type { ReactNode } from 'react';
import { cx } from './cx.js';

export type EmptyArt = 'venues' | 'bookings' | 'search' | 'inbox';

/** Small on-brand line illustrations (canvas/primary/clay), decorative only. */
function Art({ art }: { art: EmptyArt }) {
  const stroke = {
    fill: 'none',
    stroke: '#0F4D34',
    strokeWidth: 2.5,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  } as const;
  return (
    <svg viewBox="0 0 120 96" className="h-24 w-30" aria-hidden focusable="false">
      <ellipse cx="60" cy="86" rx="42" ry="6" fill="#E9E4D8" />
      {art === 'venues' ? (
        <>
          <path d="M20 74 L34 34 H86 L100 74 Z" {...stroke} fill="#DCE8DF" />
          <path d="M60 34 V74 M27 54 H93" {...stroke} strokeOpacity="0.55" />
          <ellipse cx="60" cy="54" rx="9" ry="4" {...stroke} strokeOpacity="0.55" />
          <circle cx="78" cy="64" r="4" fill="#E7F06A" stroke="#151712" strokeWidth="1.5" />
          <path
            d="M94 16 v10 M89 21 h10"
            stroke="#B4481F"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </>
      ) : art === 'bookings' ? (
        <>
          <rect x="28" y="22" width="64" height="56" rx="10" {...stroke} fill="#FFFFFF" />
          <path d="M28 38 H92 M44 16 V28 M76 16 V28" {...stroke} />
          <path
            d="M50 58 l7 7 l14 -14"
            stroke="#B4481F"
            strokeWidth="3"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="98" cy="20" r="4" fill="#E7F06A" stroke="#151712" strokeWidth="1.5" />
        </>
      ) : art === 'search' ? (
        <>
          <circle cx="52" cy="46" r="22" {...stroke} fill="#FFFFFF" />
          <path d="M68 62 L88 80" {...stroke} strokeWidth="5" />
          <path d="M44 46 h16" stroke="#B4481F" strokeWidth="3" strokeLinecap="round" />
          <circle cx="92" cy="22" r="4" fill="#E7F06A" stroke="#151712" strokeWidth="1.5" />
        </>
      ) : (
        <>
          <path d="M22 48 L34 26 H86 L98 48 V74 H22 Z" {...stroke} fill="#FFFFFF" />
          <path d="M22 48 H44 L50 58 H70 L76 48 H98" {...stroke} />
          <circle cx="92" cy="18" r="4" fill="#E7F06A" stroke="#151712" strokeWidth="1.5" />
        </>
      )}
    </svg>
  );
}

/** A friendly empty state: illustration, a line of text, and an optional action. */
export function EmptyState({
  art = 'inbox',
  title,
  description,
  action,
  className,
  testId,
}: {
  art?: EmptyArt;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string | undefined;
  testId?: string | undefined;
}) {
  return (
    <div
      className={cx(
        'flex animate-rise flex-col items-center gap-3 rounded-card border border-dashed border-line-strong bg-surface/60 px-6 py-10 text-center',
        className,
      )}
      data-testid={testId}
    >
      <Art art={art} />
      <p className="max-w-sm font-semibold text-ink">{title}</p>
      {description ? <p className="max-w-sm text-sm text-ink-muted">{description}</p> : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
