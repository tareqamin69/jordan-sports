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
  // Sport icons (catalog keys).
  'ball-kick':
    'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7.5l3.8 2.8-1.5 4.4H9.7l-1.5-4.4zM12 3v4.5M20.4 9.6l-4.6.7M17.6 19.4l-3.3-4.7M6.4 19.4l3.3-4.7M3.6 9.6l4.6.7',
  'racket-paddle':
    'M9 3.5a5.5 5.5 0 0 1 7.8 7.8l-3.5 3.5a3 3 0 0 1-4.2 0l-1.9-1.9a3 3 0 0 1 0-4.2zM8.2 15.8L4 20M18.5 17.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z',
  'racket-string':
    'M18.4 5.6a4.8 6.4 45 1 1-9 9 4.8 6.4 45 0 1 9-9zM9.4 14.6L4 20M11 9.5l5 5M13.5 7l3.5 3.5',
  'ball-generic': 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM5 7c4 2 10 2 14 0M5 17c4-2 10-2 14 0',
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
