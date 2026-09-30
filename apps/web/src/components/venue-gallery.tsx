'use client';

import type { PublicVenue } from '@jordan-sports/contracts';
import { cx } from '@jordan-sports/ui';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CourtArt } from './court-art';
import { Icon } from './icons';
import { Photo } from './photo';

/**
 * Full-bleed photo hero with a dark fade, the venue title laid over it (`children`), swipe and
 * dots on touch, arrows and a lightbox on wider screens. Without photos it shows an illustrated
 * court for the venue's first sport.
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
  const [lightbox, setLightbox] = useState<number | null>(null);
  const alt = (i: number) => t('photoAlt', { name, n: String(i + 1), total: String(media.length) });

  const show = (i: number) => {
    const n = (i + media.length) % media.length;
    const el = scroller.current?.children[n] as HTMLElement | undefined;
    el?.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
    setIndex(n);
  };
  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    setIndex(Math.round(Math.abs(el.scrollLeft) / el.clientWidth));
  };
  // The lightbox is for pointer screens; on phones the hero itself is the swipeable viewer.
  const openLightbox = (i: number) => {
    if (window.matchMedia('(min-width: 768px)').matches) setLightbox(i);
  };

  return (
    <div
      id="venue-hero"
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
            <div
              key={m.id}
              className="size-full shrink-0 snap-start md:cursor-zoom-in"
              onClick={() => openLightbox(i)}
            >
              <Photo photo={m} alt={alt(i)} sizes="100vw" eager={i === 0} />
            </div>
          ))}
        </div>
      ) : (
        // The illustration only fills the area above the title block, so its court lines never
        // cross the venue name or address (QA #3).
        <div
          className="absolute inset-x-0 top-0 h-[calc(100%-15rem)] min-h-40 overflow-hidden"
          style={{ maskImage: 'linear-gradient(to bottom, black 65%, transparent)' }}
        >
          <CourtArt icon={icon} />
        </div>
      )}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-night/75 to-transparent"
      />
      <div
        aria-hidden
        className={cx(
          'pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent from-35% to-night/90',
          media.length === 0 && 'from-55%',
        )}
      />
      {media.length > 1 ? (
        <div className="pointer-events-none absolute inset-x-0 top-1/2 hidden -translate-y-1/2 justify-between px-5 md:flex">
          <HeroArrow label={t('previousPhoto')} onClick={() => show(index - 1)} back />
          <HeroArrow label={t('nextPhoto')} onClick={() => show(index + 1)} />
        </div>
      ) : null}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 pb-10 sm:pb-12">
        <div className="pointer-events-auto mx-auto flex max-w-6xl animate-rise flex-col gap-2 px-6 text-canvas sm:px-8">
          {children}
          {media.length > 0 ? (
            <div className="-ms-3 mt-1 flex items-center justify-between gap-3">
              <div className="flex">
                {media.length > 1
                  ? media.map((m, i) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => show(i)}
                        aria-label={t('showPhoto', { n: String(i + 1) })}
                        aria-current={i === index}
                        className="grid size-8 place-items-center rounded-full focus-visible:outline-canvas"
                      >
                        <span
                          className={cx(
                            'h-1.5 rounded-full bg-canvas transition-all duration-base ease-soft',
                            i === index ? 'w-5' : 'w-1.5 opacity-50',
                          )}
                        />
                      </button>
                    ))
                  : null}
              </div>
              <button
                type="button"
                onClick={() => setLightbox(index)}
                className="pressable hidden h-10 items-center gap-2 rounded-full bg-canvas/15 px-4 text-sm font-medium text-canvas ring-1 ring-canvas/30 backdrop-blur-md transition-colors hover:bg-canvas/25 md:flex"
              >
                <Icon name="expand" className="size-4" />
                {t('allPhotos', { count: media.length })}
              </button>
            </div>
          ) : null}
        </div>
      </div>
      {lightbox !== null ? (
        <Lightbox
          media={media}
          start={lightbox}
          alt={alt}
          onClose={(i) => {
            setLightbox(null);
            show(i);
          }}
        />
      ) : null}
    </div>
  );
}

function HeroArrow({
  label,
  onClick,
  back = false,
}: {
  label: string;
  onClick: () => void;
  back?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="pressable pointer-events-auto grid size-11 place-items-center rounded-full bg-canvas/85 text-ink shadow-lift backdrop-blur transition-colors hover:bg-canvas"
    >
      <Icon name="chevron" className={cx('size-5', back ? 'ltr:rotate-180' : 'rtl:rotate-180')} />
    </button>
  );
}

/** Desktop photo viewer: a modal <dialog> (focus trap, Esc to close) with arrow-key paging. */
function Lightbox({
  media,
  start,
  alt,
  onClose,
}: {
  media: PublicVenue['media'];
  start: number;
  alt: (i: number) => string;
  onClose: (index: number) => void;
}) {
  const t = useTranslations('web.venue');
  const dialog = useRef<HTMLDialogElement>(null);
  const [i, setI] = useState(start);
  const photo = media[i]!;
  const go = (step: number) => setI((n) => (n + step + media.length) % media.length);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  return (
    <dialog
      ref={dialog}
      aria-label={t('photos')}
      onClose={() => onClose(i)}
      onClick={(e) => {
        if (e.target === e.currentTarget) dialog.current?.close();
      }}
      onKeyDown={(e) => {
        const rtl = document.documentElement.dir === 'rtl';
        if (e.key === 'ArrowRight') go(rtl ? -1 : 1);
        if (e.key === 'ArrowLeft') go(rtl ? 1 : -1);
      }}
      className="m-0 size-full max-h-none max-w-none animate-fade bg-night/95 p-0 text-canvas backdrop:bg-night/80"
    >
      <div className="flex size-full flex-col">
        <div className="flex items-center justify-between px-6 py-4">
          <span className="text-sm tabular-nums text-canvas/80" dir="ltr">
            {i + 1} / {media.length}
          </span>
          <button
            type="button"
            onClick={() => dialog.current?.close()}
            aria-label={t('closePhotos')}
            className="pressable grid size-11 place-items-center rounded-full bg-canvas/10 hover:bg-canvas/20"
          >
            <Icon name="close" className="size-5" />
          </button>
        </div>
        <div className="relative flex min-h-0 flex-1 items-center justify-center gap-4 px-6 pb-8">
          {media.length > 1 ? (
            <HeroArrow label={t('previousPhoto')} onClick={() => go(-1)} back />
          ) : null}
          <div
            key={photo.id}
            className="relative h-full min-w-0 flex-1 animate-pop overflow-hidden rounded-card"
          >
            <Photo
              photo={photo}
              alt={alt(i)}
              sizes="90vw"
              eager
              className="!bg-transparent [&>img]:object-contain"
            />
          </div>
          {media.length > 1 ? <HeroArrow label={t('nextPhoto')} onClick={() => go(1)} /> : null}
        </div>
      </div>
    </dialog>
  );
}
