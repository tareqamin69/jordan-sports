import { sportIconPaths } from '@jordan-sports/ui';
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
  swap: 'M4 8h13l-3.5-3.5M20 16H7l3.5 3.5',
  sliders: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h13M21 18h-2M8 4v4M16 10v4M18 16v4',
  more: 'M6 12h.01M12 12h.01M18 12h.01',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  close: 'M6 6l12 12M18 6L6 18',
  expand: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  card: 'M3 6h18v12H3zM3 10h18M7 15h4',
  flag: 'M5 21V4M5 4h11l-2 4 2 4H5',
  lock: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  bank: 'M3 10l9-6 9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18',
  map: 'M9 4L3 6.5v13.5l6-2.5 6 2.5 6-2.5V4l-6 2.5zM9 4v13.5M15 6.5V20',
  // Amenities (looked up by the catalog amenity key; unknown keys fall back to a check mark).
  parking: 'M5 3h14v18H5zM10 17V7h3.5a3 3 0 0 1 0 6H10',
  hanger: 'M12 7a2 2 0 1 1 2-2c0 1-2 1.5-2 3l8.4 6.2a1 1 0 0 1-.6 1.8H4.2a1 1 0 0 1-.6-1.8L12 8',
  shower:
    'M5 21V7a3 3 0 0 1 6 0M8 11h8a4 4 0 0 0-8 0M10 15v.01M13 15v.01M16 15v.01M11 18v.01M14 18v.01M17 18v.01',
  dome: 'M4 21h16M6 21v-6a6 6 0 0 1 12 0v6M12 9V5.5M12 3.5v.01M10 21v-3a2 2 0 0 1 4 0v3',
  cup: 'M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5zM16 11h1.5a2.5 2.5 0 0 1 0 5H16M8 3v3M12 3v3',
  tag: 'M3 12V4h8l10 10-8 8zM7.5 8.5v.01',
  seats: 'M7 4v9h10M7 13l-2 7M17 13l2 7M7 9h10',
  accessible: 'M12 4.5v.01M11 8v6h6l2 5M11 11h5M8.5 10.3A5 5 0 1 0 15 18',
  ...sportIconPaths,
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
