import type { VenueSummary } from '@jordan-sports/contracts';
import { CourtArt } from './court-art';
import { Photo } from './photo';

/** The venue's cover photo (blur-up, responsive), or an illustrated court until it has photos. */
export function VenuePhoto({
  venue,
  className,
  variant = 'perspective',
  eager = false,
  sizes = '(min-width: 1024px) 400px, 90vw',
}: {
  venue: Pick<VenueSummary, 'cover' | 'sports'>;
  className?: string;
  variant?: 'perspective' | 'top';
  eager?: boolean;
  sizes?: string;
}) {
  return venue.cover ? (
    <Photo photo={venue.cover} alt="" sizes={sizes} eager={eager} className={className} />
  ) : (
    <CourtArt icon={venue.sports[0]?.icon} variant={variant} className={className} />
  );
}
