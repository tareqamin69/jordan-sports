import { use } from 'react';
import { VenueEditor } from '@/components/venues/venue-editor';

export default function Page({ params }: { params: Promise<{ venueId: string }> }) {
  const { venueId } = use(params);
  return <VenueEditor venueId={venueId} />;
}
