import type { CSSProperties } from 'react';

const colors = ['#E7F06A', '#E3A583', '#F4F0E6', '#8DB39B', '#B4481F', '#FFFFFF'];
// Fixed spread (no randomness, so server and client render the same pieces).
const pieces = Array.from({ length: 14 }, (_, i) => {
  const angle = (i / 14) * Math.PI * 2;
  return {
    '--x': `${Math.round(Math.cos(angle) * (70 + (i % 3) * 38))}px`,
    '--y': `${Math.round(Math.sin(angle) * 34 - 30 - (i % 4) * 8)}px`,
    '--r': `${(i % 2 ? 1 : -1) * (160 + i * 23)}deg`,
    '--c': colors[i % colors.length],
    '--d': `${(i % 5) * 30}ms`,
  } as CSSProperties;
});

/** "Booking confirmed" banner: a check that draws itself and a small confetti burst. */
export function BookingSuccess({ message }: { message: string }) {
  return (
    <div
      role="status"
      className="relative flex animate-pop items-center gap-4 overflow-hidden rounded-card bg-primary p-5 text-on-primary"
    >
      <div className="confetti" aria-hidden>
        {pieces.map((style, i) => (
          <i key={i} style={style} />
        ))}
      </div>
      <span className="relative grid size-12 shrink-0 place-items-center rounded-full bg-on-primary/15">
        <span className="absolute inset-0 animate-ping rounded-full bg-on-primary/20 [animation-iteration-count:2] motion-reduce:hidden" />
        <svg viewBox="0 0 24 24" className="size-7" aria-hidden>
          <path
            d="M5 12.5l4.5 4.5L19 7.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="22"
            style={{ '--path-length': 22 } as CSSProperties}
            className="animate-draw"
          />
        </svg>
      </span>
      <p className="relative font-medium leading-7">{message}</p>
    </div>
  );
}
