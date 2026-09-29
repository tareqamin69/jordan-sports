import { cx } from '@jordan-sports/ui';
import { useId, type ReactNode } from 'react';

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

/**
 * Home hero: a floodlit pitch at dusk. Decorative only. Three stacked layers (sky, hills, pitch)
 * drift at different speeds as the page scrolls (CSS scroll-driven parallax, see motion.css); at
 * rest they line up as one picture because they share the same viewBox.
 */
export function HeroArt({ className }: { className?: string }) {
  const id = useId().replace(/:/g, '');
  const layer = (children: ReactNode, extra?: string) => (
    <svg
      viewBox="-400 0 1190 470"
      preserveAspectRatio="xMidYMax slice"
      aria-hidden
      focusable="false"
      className={cx('absolute inset-0 block size-full', extra)}
    >
      {children}
    </svg>
  );
  return (
    // The sky's top colour fills in above the sky layer as it drifts down.
    <div aria-hidden className={cx('bg-[#2B3A4A]', className)}>
      {layer(
        <>
          <defs>
            <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#2B3A4A" />
              <stop offset="0.55" stopColor="#C9825A" />
              <stop offset="1" stopColor="#E9B98A" />
            </linearGradient>
            <radialGradient id={`${id}-sun`} cx="50%" cy="50%" r="50%">
              <stop offset="0" stopColor="#FFE2B0" stopOpacity="0.9" />
              <stop offset="1" stopColor="#FFE2B0" stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect x="-400" width="1190" height="470" fill={`url(#${id}-sky)`} />
          <circle cx="470" cy="250" r="120" fill={`url(#${id}-sun)`} />
        </>,
        'parallax-fast',
      )}
      {layer(
        <path
          d="M-400 250 L-300 236 L-180 248 L-60 232 L0 250 L60 238 L110 246 L170 230 L240 244 L300 232 L390 242 L470 230 L560 246 L680 234 L790 244 L790 290 L-400 290 Z"
          fill="#6E5A48"
          fillOpacity="0.55"
        />,
        'parallax-slow',
      )}
      {/*
        The court's near edge sits low in the frame (y >= 410) so its lines never run behind the
        title/subtitle text block anchored near the hero's bottom — Arabic descenders sit lower
        than Latin ones, so the margin below y >= 385 wasn't enough in `ar`. The far goal box
        (visible in the CourtArt thumbnail version of this scene) is dropped here rather than
        pushed further down, since there's no room left before the viewBox's bottom edge.
      */}
      {layer(
        <>
          <rect x="-400" y="280" width="1190" height="190" fill="#0C3A27" />
          <polygon points="-20,470 410,470 300,410 90,410" fill="#0F4D34" />
          <g fill="none" stroke="#F4F0E6" strokeOpacity="0.8" strokeWidth="2">
            <polygon points="-20,470 410,470 300,410 90,410" />
            <line x1="195" y1="410" x2="195" y2="470" />
            <line x1="40" y1="448" x2="350" y2="448" />
          </g>
          <line x1="30" y1="448" x2="360" y2="448" stroke="#151712" strokeWidth="4" />
          <circle cx="255" cy="415" r="5" fill="#E7F06A" />
        </>,
      )}
    </div>
  );
}
