import type { SVGProps } from 'react';

/**
 * Small inline icon set (24×24, stroke = currentColor). Sport icons are looked up by the
 * catalog's `icon` key, so the UI never names a specific sport.
 */
const paths: Record<string, string> = {
  chevron: 'M9 6l6 6-6 6',
  pin: 'M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21zM12 12.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  phone:
    'M5 4h3l2 5-2.5 1.5a11 11 0 0 0 6 6L15 14l5 2v3a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4',
  share: 'M12 3v12M7 8l5-5 5 5M5 14v6h14v-6',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  home: 'M4 11l8-7 8 7v9H4z',
  compass: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM15.5 8.5l-2 5-5 2 2-5z',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c1.5-4 4.5-6 8-6s6.5 2 8 6',
  grid: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
  more: 'M6 12h.01M12 12h.01M18 12h.01',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  close: 'M6 6l12 12M18 6L6 18',
  // Sport icons (catalog keys).
  'ball-kick':
    'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7.5l3.8 2.8-1.5 4.4H9.7l-1.5-4.4zM12 3v4.5M20.4 9.6l-4.6.7M17.6 19.4l-3.3-4.7M6.4 19.4l3.3-4.7M3.6 9.6l4.6.7',
  'racket-paddle':
    'M9 3.5a5.5 5.5 0 0 1 7.8 7.8l-3.5 3.5a3 3 0 0 1-4.2 0l-1.9-1.9a3 3 0 0 1 0-4.2zM8.2 15.8L4 20M18.5 17.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z',
  'racket-string':
    'M18.4 5.6a4.8 6.4 45 1 1-9 9 4.8 6.4 45 0 1 9-9zM9.4 14.6L4 20M11 9.5l5 5M13.5 7l3.5 3.5',
  'ball-generic': 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM5 7c4 2 10 2 14 0M5 17c4-2 10-2 14 0',
  'ball-bounce':
    'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3v18M6 5.5c2.3 3 2.3 10.5 0 13.5M18 5.5c-2.3 3-2.3 10.5 0 13.5',
  'ball-volley':
    'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM4 9c5-2.3 11-2.3 16 0M4 15c5 2.3 11 2.3 16 0M12 3v18',
  'racket-squash':
    'M9.5 3.5a5 5 0 0 1 7 7l-2.8 2.8a3 3 0 0 1-4.2 0l-2.8-2.8a5 5 0 0 1 2.8-7zM11.2 13.2L4 20.5',
  shuttlecock:
    'M12 3l3.3 7-3.3-1-3.3 1L12 3zM8.7 11.5h6.6l-1.2 4.3H9.9zM12 19.7a1.1 1.1 0 1 0 0-2.2 1.1 1.1 0 0 0 0 2.2',
  'paddle-tt':
    'M9 4.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9zM7.5 12.5L4 20M17 16.7a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4',
  'cue-ball': 'M9 15a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM20 20L11.8 11.8',
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

export function Icon({
  name,
  className,
  ...rest
}: { name: string } & Omit<SVGProps<SVGSVGElement>, 'name'>) {
  const d = paths[name] ?? paths['ball-generic'];
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
      className={className ?? 'size-5'}
      {...rest}
    >
      <path d={d} />
    </svg>
  );
}
