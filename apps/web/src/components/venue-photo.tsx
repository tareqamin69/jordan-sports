import type { VenueSummary } from '@jordan-sports/contracts';
import { cx } from '@jordan-sports/ui';
import { useTranslations } from 'next-intl';
import { CourtArt } from './court-art';
import { Photo } from './photo';

/**
 * The venue's cover photo (blur-up, responsive), a stock photo of its sport marked "illustrative",
 * or an illustrated court when there is neither.
 */
export function VenuePhoto({
  venue,
  className,
  variant = 'perspective',
  eager = false,
  sizes = '(min-width: 1024px) 400px, 90vw',
  stockLabel = true,
}: {
  venue: Pick<VenueSummary, 'cover' | 'sports'>;
  className?: string;
  variant?: 'perspective' | 'top';
  eager?: boolean;
  sizes?: string;
  /** Small thumbnails skip the "illustrative photo" label (it would cover the photo). */
  stockLabel?: boolean;
}) {
  if (!venue.cover) {
    return <CourtArt icon={venue.sports[0]?.icon} variant={variant} className={className} />;
  }
  return (
    <>
      <Photo photo={venue.cover} alt="" sizes={sizes} eager={eager} className={className} />
      {venue.cover.stock && stockLabel ? <StockLabel /> : null}
    </>
  );
}

export function StockLabel({ className }: { className?: string }) {
  const t = useTranslations('web.home');
  return (
    <span
      className={cx(
        'pointer-events-none absolute bottom-3 start-3 z-10 rounded-full bg-night/60 px-2.5 py-1 text-[11px] font-medium text-canvas backdrop-blur-sm',
        className,
      )}
    >
      {t('stockPhoto')}
    </span>
  );
}
