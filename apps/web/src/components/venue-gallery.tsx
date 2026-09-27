'use client';

import type { PublicVenue } from '@jordan-sports/contracts';
import { cx } from '@jordan-sports/ui';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';

/** Swipeable photo gallery with a counter and thumbnails. */
export function VenueGallery({ media, name }: { media: PublicVenue['media']; name: string }) {
  const t = useTranslations('web.venue');
  const scroller = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  if (media.length === 0) return null;

  const show = (i: number) => {
    const el = scroller.current?.children[i] as HTMLElement | undefined;
    el?.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
    setIndex(i);
  };
  const counter = [index + 1, media.length].join('/');
  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    setIndex(Math.round(Math.abs(el.scrollLeft) / el.clientWidth));
  };

  return (
    <div className="flex flex-col gap-2" aria-roledescription="carousel" aria-label={t('photos')}>
      <div className="relative overflow-hidden rounded-xl">
        <div
          ref={scroller}
          onScroll={onScroll}
          className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none]"
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
              className="aspect-[16/10] w-full shrink-0 snap-start object-cover sm:aspect-[21/9]"
            />
          ))}
        </div>
        {media.length > 1 ? (
          <span
            className="absolute bottom-2 end-2 rounded-full bg-black/60 px-2.5 py-0.5 text-sm text-white"
            dir="ltr"
            aria-hidden
          >
            {counter}
          </span>
        ) : null}
      </div>
      {media.length > 1 ? (
        <div className="flex gap-2">
          {media.map((m, i) => (
            <button
              key={m.id}
              type="button"
              onClick={() => show(i)}
              aria-label={t('showPhoto', { n: String(i + 1) })}
              aria-current={i === index}
              className={cx(
                'overflow-hidden rounded-md border-2',
                i === index ? 'border-brand-700' : 'border-transparent opacity-70',
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- see above */}
              <img src={`/api${m.url}`} alt="" className="h-12 w-20 object-cover" loading="lazy" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
