'use client';

import { buttonClass } from '@jordan-sports/ui';
import { useTranslations } from 'next-intl';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import { Icon } from './icons';

/**
 * MapLibre GL is a heavy library (~270KB) the venue page doesn't need for its first paint, so it
 * loads only once this component asks for it.
 */
const VenueMap = dynamic(() => import('./venue-map').then((m) => m.VenueMap), {
  ssr: false,
  loading: () => (
    <div
      aria-hidden
      className="skeleton mt-4 aspect-[4/3] w-full rounded-card border border-line"
    />
  ),
});

/**
 * A map preview card (drawn streets and a pin, no JS library) that turns into the interactive
 * map on tap. Keeps MapLibre off the venue page's critical path entirely.
 */
export function VenueMapCard({
  location,
  name,
}: {
  location: { lat: number; lng: number };
  name: string;
}) {
  const t = useTranslations('web.venue');
  const [open, setOpen] = useState(false);
  if (open) return <VenueMap location={location} name={name} />;
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label={`${t('showMap')}: ${t('mapPreview', { name })}`}
      className="lift group relative mt-4 block aspect-[4/3] w-full overflow-hidden rounded-card border border-line bg-[#EAE6DA] text-start"
      data-testid="map-preview"
    >
      <svg
        viewBox="0 0 400 300"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden
        className="zoom-media absolute inset-0 size-full"
      >
        <rect width="400" height="300" fill="#EAE6DA" />
        <path d="M0 210 C90 190 150 240 240 215 S360 170 400 180 V300 H0Z" fill="#D5E3D0" />
        <circle cx="330" cy="70" r="46" fill="#D5E3D0" />
        <g fill="none" stroke="#FFFFFF" strokeLinecap="round">
          <path d="M-10 120 L410 95" strokeWidth="14" />
          <path d="M150 -10 L185 310" strokeWidth="12" />
          <path d="M-10 40 C80 60 120 30 230 50 S340 20 410 30" strokeWidth="7" />
          <path d="M260 -10 L300 310" strokeWidth="7" />
          <path d="M-10 250 L160 230 L410 260" strokeWidth="7" />
          <path d="M60 -10 L90 310" strokeWidth="5" />
        </g>
      </svg>
      <span className="absolute start-1/2 top-1/2 -translate-x-1/2 -translate-y-full rtl:translate-x-1/2">
        <span className="absolute inset-x-0 bottom-0 mx-auto size-3 translate-y-1/2 animate-ping rounded-full bg-primary/40 motion-reduce:hidden" />
        <svg viewBox="0 0 24 24" className="relative size-10 drop-shadow-md" aria-hidden>
          <path
            d="M12 22s-7.5-6.6-7.5-12.2A7.5 7.5 0 0 1 19.5 9.8C19.5 15.4 12 22 12 22z"
            fill="#0F4D34"
            stroke="#fff"
            strokeWidth="1.5"
          />
          <circle cx="12" cy="10" r="2.8" fill="#fff" />
        </svg>
      </span>
      <span
        className={buttonClass({
          variant: 'secondary',
          size: 'sm',
          className: 'pointer-events-none absolute bottom-3 end-3 shadow-lift',
        })}
      >
        <Icon name="map" className="size-4" />
        {t('showMap')}
      </span>
    </button>
  );
}
