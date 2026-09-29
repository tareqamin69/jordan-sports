import type { VenueSummary } from '@jordan-sports/contracts';
import { cx } from '@jordan-sports/ui';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
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

/** "Illustrative photo" tag on a stock photo; `linked` makes it a link to the photo credits. */
export function StockLabel({
  className,
  linked = false,
}: {
  className?: string;
  linked?: boolean;
}) {
  const t = useTranslations('web.home');
  const style = cx(
    'absolute bottom-3 start-3 z-10 rounded-full bg-night/60 px-2.5 py-1 text-[11px] font-medium text-canvas backdrop-blur-sm',
    linked ? 'hover:bg-night/80' : 'pointer-events-none',
    className,
  );
  return linked ? (
    <Link href="/credits" className={style}>
      {t('stockPhoto')}
    </Link>
  ) : (
    <span className={style}>{t('stockPhoto')}</span>
  );
}
