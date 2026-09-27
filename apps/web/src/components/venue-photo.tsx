import type { VenueSummary } from '@jordan-sports/contracts';
import { cx } from '@jordan-sports/ui';
import { CourtArt } from './court-art';

/** The venue's cover photo, or an illustrated court until real photos are uploaded. */
export function VenuePhoto({
  venue,
  className,
  variant = 'perspective',
  eager = false,
}: {
  venue: Pick<VenueSummary, 'cover' | 'sports'>;
  className?: string;
  variant?: 'perspective' | 'top';
  eager?: boolean;
}) {
  return venue.cover ? (
    // eslint-disable-next-line @next/next/no-img-element -- images are served by our API (already optimized WebP)
    <img
      src={`/api${venue.cover.url}`}
      alt=""
      width={venue.cover.width}
      height={venue.cover.height}
      loading={eager ? 'eager' : 'lazy'}
      className={cx('size-full object-cover', className)}
    />
  ) : (
    <CourtArt icon={venue.sports[0]?.icon} variant={variant} className={className} />
  );
}
