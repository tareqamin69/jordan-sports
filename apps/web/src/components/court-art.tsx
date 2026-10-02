import { cx } from '@jordan-sports/ui';
import { useId } from 'react';

/**
 * Illustrated placeholders shown until a venue uploads real photos (and the home hero art).
 * Chosen by the catalog's sport icon key, so the UI never names a specific sport.
 */
type Scene = 'pitch' | 'padel' | 'clay' | 'hardwood' | 'pool' | 'night';

const sceneByIcon: Record<string, Scene> = {
  'ball-kick': 'pitch',
  'ball-handball': 'pitch',
  'racket-paddle': 'padel',
  'racket-squash': 'padel',
  'paddle-tt': 'padel',
  'racket-string': 'clay',
  'ball-beach': 'clay',
  'track-oval': 'clay',
  'ball-bounce': 'hardwood',
  'ball-volley': 'hardwood',
  shuttlecock: 'hardwood',
  wave: 'pool',
};

export function sceneFor(icon: string | undefined): Scene {
  return (icon && sceneByIcon[icon]) || 'night';
}

const line = { fill: 'none', stroke: '#F4F0E6', strokeWidth: 2 } as const;

export function CourtArt({
  icon,
  className,
  variant = 'perspective',
}: {
  icon?: string | undefined;
  className?: string;
  /** `perspective` for large photos, `top` for small thumbnails. */
  variant?: 'perspective' | 'top';
}) {
  const id = useId().replace(/:/g, '');
  const scene = sceneFor(icon);
  const palette = {
    pitch: { bg: '#0B1B13', court: '#1F6B41', stripe: '#236F45' },
    padel: { bg: '#101A2B', court: '#1D4FB3', stripe: '#2257C2' },
    clay: { bg: '#24150E', court: '#B8692E', stripe: '#C0733A' },
    hardwood: { bg: '#1E150C', court: '#B98A4E', stripe: '#C29558' },
    pool: { bg: '#0B1C26', court: '#1F7FA6', stripe: '#2A8DB5' },
    night: { bg: '#10150F', court: '#0F4D34', stripe: '#14573C' },
  }[scene];

  return (
    <svg
      viewBox="0 0 400 250"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
      focusable="false"
      className={cx('block size-full', className)}
    >
      <defs>
        <radialGradient id={`${id}-glow`} cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#FFF4D6" stopOpacity="0.85" />
          <stop offset="1" stopColor="#FFF4D6" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="400" height="250" fill={palette.bg} />
      {variant === 'perspective' ? (
        <>
          <polygon points="10,250 390,250 310,96 90,96" fill={palette.court} />
          {scene === 'pool' ? (
            <g {...line} strokeOpacity="0.55" strokeWidth={1.5}>
              <line x1="60" y1="250" x2="130" y2="96" />
              <line x1="140" y1="250" x2="173" y2="96" />
              <line x1="200" y1="250" x2="200" y2="96" />
              <line x1="260" y1="250" x2="227" y2="96" />
              <line x1="340" y1="250" x2="270" y2="96" />
            </g>
          ) : (
            <g {...line} strokeOpacity="0.62" strokeWidth={1.5}>
              <polygon points="10,250 390,250 310,96 90,96" />
              <line x1="52" y1="172" x2="348" y2="172" />
              {scene === 'pitch' || scene === 'night' ? (
                <ellipse cx="200" cy="172" rx="40" ry="13" />
              ) : (
                <line x1="200" y1="96" x2="200" y2="250" />
              )}
              {scene === 'padel' || scene === 'clay' ? (
                <>
                  <line x1="71" y1="134" x2="329" y2="134" />
                  <line x1="31" y1="211" x2="369" y2="211" />
                </>
              ) : null}
              {scene === 'hardwood' ? <circle cx="200" cy="172" r="14" /> : null}
            </g>
          )}
          {scene === 'padel' || scene === 'clay' ? (
            <line x1="40" y1="172" x2="360" y2="172" stroke="#151712" strokeWidth={4} />
          ) : null}
          <circle cx="40" cy="22" r="100" fill={`url(#${id}-glow)`} opacity="0.55" />
          <circle cx="360" cy="22" r="100" fill={`url(#${id}-glow)`} opacity="0.55" />
          {scene !== 'pool' ? <circle cx="262" cy="200" r="4.5" fill="#E7F06A" /> : null}
        </>
      ) : (
        <>
          <rect x="0" y="0" width="400" height="250" fill={palette.court} />
          <g {...line} strokeOpacity="0.7" strokeWidth={4}>
            <rect x="70" y="30" width="260" height="190" />
            <line x1="200" y1="30" x2="200" y2="220" />
            {scene === 'pitch' || scene === 'night' || scene === 'hardwood' ? (
              <circle cx="200" cy="125" r="34" />
            ) : (
              <line x1="70" y1="125" x2="330" y2="125" />
            )}
          </g>
        </>
      )}
    </svg>
  );
}
