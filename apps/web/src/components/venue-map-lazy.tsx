'use client';

import dynamic from 'next/dynamic';

/**
 * MapLibre GL is a heavy library (~200KB) the venue page doesn't need for its initial paint — the
 * map sits below the booking widget. Loaded only once this component mounts, instead of being
 * part of the page's initial JS bundle.
 */
export const VenueMap = dynamic(() => import('./venue-map').then((m) => m.VenueMap), {
  ssr: false,
  loading: () => (
    <div
      aria-hidden
      className="mt-4 aspect-[4/3] w-full animate-pulse rounded-card border border-line bg-canvas-deep"
    />
  ),
});
