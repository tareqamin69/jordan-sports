'use client';

import { mediaWidths } from '@jordan-sports/contracts';
import { cx } from '@jordan-sports/ui';
import { useState } from 'react';

export interface PhotoSource {
  /** API path (e.g. `/v1/media/…`); `?w=` picks a resized copy. */
  url: string;
  width: number;
  height: number;
  blur?: string | null | undefined;
}

/**
 * A responsive photo: `srcset` of the API's resized copies (320–1600 px), a blurred preview until
 * it loads, then a short fade. Always fills its box (the parent sets the size), so it never shifts
 * the layout.
 */
export function Photo({
  photo,
  alt,
  sizes,
  eager = false,
  className,
}: {
  photo: PhotoSource;
  alt: string;
  /** e.g. `(min-width: 1024px) 33vw, 100vw` */
  sizes: string;
  eager?: boolean;
  className?: string;
}) {
  // Eager photos (the hero) are shown at once so the largest paint is never held back by a fade.
  const [loaded, setLoaded] = useState(eager);
  const base = `/api${photo.url}`;
  const widths = mediaWidths.filter((w) => w < photo.width);
  const srcSet = [...widths.map((w) => `${base}?w=${w} ${w}w`), `${base} ${photo.width}w`].join(
    ', ',
  );
  return (
    <span
      className={cx('relative block size-full overflow-hidden bg-canvas-deep', className)}
      style={
        photo.blur
          ? {
              backgroundImage: `url(${photo.blur})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }
          : undefined
      }
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- our API serves optimized WebP copies */}
      <img
        src={(widths as readonly number[]).includes(640) ? `${base}?w=640` : base}
        srcSet={srcSet}
        sizes={sizes}
        alt={alt}
        width={photo.width}
        height={photo.height}
        loading={eager ? 'eager' : 'lazy'}
        fetchPriority={eager ? 'high' : undefined}
        decoding="async"
        onLoad={() => setLoaded(true)}
        ref={(img) => {
          // Cached images can finish before hydration attaches onLoad.
          if (img?.complete && img.naturalWidth > 0) setLoaded(true);
        }}
        className={cx(
          'size-full object-cover transition-[opacity,filter] duration-500 ease-soft',
          loaded ? 'opacity-100 blur-0' : 'opacity-0 blur-sm',
        )}
      />
    </span>
  );
}
