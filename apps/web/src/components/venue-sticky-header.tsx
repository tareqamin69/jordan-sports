'use client';

import { buttonClass, cx } from '@jordan-sports/ui';
import { useEffect, useState } from 'react';

/**
 * A compact bar (venue name, "from" price, Book) that slides in over the site header once the
 * photo hero has scrolled away. Transform-only, so it never shifts the page.
 */
export function VenueStickyHeader({
  name,
  price,
  bookLabel,
}: {
  name: string;
  price: string | null;
  bookLabel: string;
}) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const hero = document.getElementById('venue-hero');
    if (!hero) return;
    const io = new IntersectionObserver(([entry]) => setShown(!entry!.isIntersecting), {
      rootMargin: '-72px 0px 0px 0px',
    });
    io.observe(hero);
    return () => io.disconnect();
  }, []);

  return (
    <div
      aria-hidden={!shown}
      inert={!shown}
      className={cx(
        'fixed inset-x-0 top-0 z-40 border-b border-line bg-canvas/95 backdrop-blur-md transition-transform duration-slow ease-soft',
        shown ? 'translate-y-0' : '-translate-y-full',
      )}
      data-testid="venue-sticky-header"
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-display text-lg leading-[1.35]">{name}</span>
          {price ? <span className="text-xs text-ink-muted">{price}</span> : null}
        </div>
        <a href="#book" className={buttonClass({ className: 'shrink-0 px-6' })}>
          {bookLabel}
        </a>
      </div>
    </div>
  );
}
