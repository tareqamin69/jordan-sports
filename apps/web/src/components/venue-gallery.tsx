'use client';

import type { PublicVenue } from '@jordan-sports/contracts';
import { cx } from '@jordan-sports/ui';
import { useTranslations } from 'next-intl';
import { useRef, useState, type ReactNode } from 'react';
import { CourtArt } from './court-art';

/**
 * Full-bleed, swipeable photo hero with a dark fade, dot controls and the venue title laid over
 * it (`children`). Without photos it shows an illustrated court for the venue's first sport.
 */
export function VenueGallery({
  media,
  name,
  icon,
  children,
}: {
  media: PublicVenue['media'];
  name: string;
  icon?: string | undefined;
  children: ReactNode;
}) {
  const t = useTranslations('web.venue');
  const scroller = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  const show = (i: number) => {
    const el = scroller.current?.children[i] as HTMLElement | undefined;
    el?.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
    setIndex(i);
  };
  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    setIndex(Math.round(Math.abs(el.scrollLeft) / el.clientWidth));
  };

  return (
    <div
      className="relative h-[440px] overflow-hidden rounded-b-hero bg-night sm:h-[520px]"
      aria-roledescription="carousel"
      aria-label={t('photos')}
    >
      {media.length > 0 ? (
        <div
          ref={scroller}
          onScroll={onScroll}
          className="no-scrollbar flex size-full snap-x snap-mandatory overflow-x-auto"
        >
          {media.map((m, i) => (
            // eslint-disable-next-line @next/next/no-img-element -- images are served by our API (already optimized WebP)
            <img
              key={m.id}
              src={`/api${m.url}`}
              alt={t('photoAlt', { name, n: String(i + 1), total: String(media.length) })}
              width={m.width}
              height={m.height}
              loading={i === 0 ? 'eager' : 'lazy'}
              className="size-full shrink-0 snap-start object-cover"
            />
          ))}
        </div>
      ) : (
        <CourtArt icon={icon} className="absolute inset-0" />
      )}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-night/75 to-transparent"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent from-35% to-night/90"
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 pb-10 sm:pb-12">
        <div className="pointer-events-auto mx-auto flex max-w-6xl animate-rise flex-col gap-2 px-6 text-canvas sm:px-8">
          {children}
          {media.length > 1 ? (
            <div className="-ms-2 mt-1 flex">
              {media.map((m, i) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => show(i)}
                  aria-label={t('showPhoto', { n: String(i + 1) })}
                  aria-current={i === index}
                  className="grid size-6 place-items-center rounded-full focus-visible:outline-canvas"
                >
                  <span
                    className={cx(
                      'h-1.5 rounded-full bg-canvas transition-all duration-300',
                      i === index ? 'w-5' : 'w-1.5 opacity-50',
                    )}
                  />
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
