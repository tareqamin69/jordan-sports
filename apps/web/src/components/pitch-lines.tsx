import { cx } from '@jordan-sports/ui';

/**
 * The home hero's backdrop: pitch markings seen from above, drawn in thin ivory lines, with the
 * ball in lime. Pure geometry (no illustration), so it reads as "a pitch" for every sport.
 */
export function PitchLines({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 1200 640"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
      className={cx('pointer-events-none', className)}
    >
      <defs>
        <linearGradient id="pitch-fade" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#f6f1e7" stopOpacity="0.05" />
          <stop offset="0.55" stopColor="#f6f1e7" stopOpacity="0.16" />
          <stop offset="1" stopColor="#f6f1e7" stopOpacity="0.26" />
        </linearGradient>
        {/* Mown stripes, barely there. */}
        <pattern id="pitch-stripes" width="120" height="640" patternUnits="userSpaceOnUse">
          <rect width="60" height="640" fill="#f6f1e7" fillOpacity="0.025" />
        </pattern>
      </defs>
      <rect width="1200" height="640" fill="url(#pitch-stripes)" />
      <g fill="none" stroke="url(#pitch-fade)" strokeWidth="2">
        <rect x="40" y="40" width="1120" height="560" rx="6" />
        <line x1="600" y1="40" x2="600" y2="600" />
        <circle cx="600" cy="320" r="92" />
        <rect x="40" y="170" width="150" height="300" />
        <rect x="40" y="245" width="56" height="150" />
        <rect x="1010" y="170" width="150" height="300" />
        <rect x="1104" y="245" width="56" height="150" />
        <path d="M190 268 A70 70 0 0 1 190 372" />
        <path d="M1010 268 A70 70 0 0 0 1010 372" />
      </g>
      <circle cx="600" cy="320" r="4" fill="#f6f1e7" fillOpacity="0.3" />
      <circle cx="884" cy="214" r="11" fill="#e7f06a" />
      <circle cx="884" cy="214" r="26" fill="#e7f06a" fillOpacity="0.12" />
    </svg>
  );
}
