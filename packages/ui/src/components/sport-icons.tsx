import type { SVGProps } from 'react';
import { cx } from './cx.js';

/**
 * Sport icons, looked up by the catalog's `icon` key (24×24, stroke = currentColor). Shared by the
 * web app and the admin icon picker so a sport's icon is picked from what players will see.
 */
export const sportIconPaths: Record<string, string> = {
  'ball-kick':
    'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7.5l3.8 2.8-1.5 4.4H9.7l-1.5-4.4zM12 3v4.5M20.4 9.6l-4.6.7M17.6 19.4l-3.3-4.7M6.4 19.4l3.3-4.7M3.6 9.6l4.6.7',
  'racket-paddle':
    'M9 3.5a5.5 5.5 0 0 1 7.8 7.8l-3.5 3.5a3 3 0 0 1-4.2 0l-1.9-1.9a3 3 0 0 1 0-4.2zM8.2 15.8L4 20M18.5 17.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z',
  'racket-string':
    'M18.4 5.6a4.8 6.4 45 1 1-9 9 4.8 6.4 45 0 1 9-9zM9.4 14.6L4 20M11 9.5l5 5M13.5 7l3.5 3.5',
  'ball-generic': 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM5 7c4 2 10 2 14 0M5 17c4-2 10-2 14 0',
  'ball-bounce':
    'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3v18M6 5.5c2.3 3 2.3 10.5 0 13.5M18 5.5c-2.3 3-2.3 10.5 0 13.5',
  // Volleyball: a tri-panel "star" seam from the center (distinct from basketball's cross).
  'ball-volley': 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 12V3.3M12 12l6.8 3.6M12 12l-6.8 3.6',
  'racket-squash':
    'M9.5 3.5a5 5 0 0 1 7 7l-2.8 2.8a3 3 0 0 1-4.2 0l-2.8-2.8a5 5 0 0 1 2.8-7zM11.2 13.2L4 20.5',
  shuttlecock:
    'M12 3l3.3 7-3.3-1-3.3 1L12 3zM8.7 11.5h6.6l-1.2 4.3H9.9zM12 19.7a1.1 1.1 0 1 0 0-2.2 1.1 1.1 0 0 0 0 2.2',
  'paddle-tt':
    'M9 4.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9zM7.5 12.5L4 20M17 16.7a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4',
  'cue-ball': 'M9 15a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM20 20L11.8 11.8',
  // Futsal: a mini goal frame (indoor football's distinguishing mark, vs. football's pentagon ball).
  'goal-net': 'M4 20V6h16v14M4 10.5h16M4 15h16M9 6v14M15 6v14',
  wave: 'M3 8.5c2-2 4-2 6 0s4 2 6 0 4-2 6 0M3 14.5c2-2 4-2 6 0s4 2 6 0 4-2 6 0M3 20.5c2-2 4-2 6 0s4 2 6 0 4-2 6 0',
  dumbbell: 'M4 12h16M4 9v6M7 7v10M17 7v10M20 9v6',
  'bowling-pin':
    'M12 3c1.6 0 2.4 1.6 1.7 3.2-.8 1.7-.6 2.4 .6 3.6 2.3 2.3 1.7 6.7-2.3 6.7s-4.6-4.4-2.3-6.7c1.2-1.2 1.4-1.9 .6-3.6C9.6 4.6 10.4 3 12 3zM6 18a2 2 0 1 0 0 4 2 2 0 0 0 0-4',
  'ball-handball': 'M15 15a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM2 8h5M2 11h4M3 14h3',
  glove:
    'M7 20v-5a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3v2a3 3 0 0 1-3 3H10a3 3 0 0 1-3-3zM10 12V8a2 2 0 1 1 4 0v4M14 12V7a2 2 0 1 1 4 0v6',
  'ball-beach':
    'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM4 9c5-2.3 11-2.3 16 0M12 3v18M3.5 17.5c3-1.2 6-1.2 9 0',
  'track-oval':
    'M3 8a9 4.5 0 0 1 18 0v8a9 4.5 0 0 1-18 0zM3 8a9 4.5 0 0 0 18 0M3 16a9 4.5 0 0 0 18 0M7.5 8a4.5 4.5 0 0 1 9 0v8a4.5 4.5 0 0 1-9 0z',
};

export const SPORT_ICON_KEYS = Object.keys(sportIconPaths);
export const DEFAULT_SPORT_ICON = 'ball-generic';

export function SportIcon({
  name,
  className,
  ...rest
}: { name: string } & Omit<SVGProps<SVGSVGElement>, 'name'>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      className={cx(className ?? 'size-5')}
      {...rest}
    >
      <path d={sportIconPaths[name] ?? sportIconPaths[DEFAULT_SPORT_ICON]} />
    </svg>
  );
}
