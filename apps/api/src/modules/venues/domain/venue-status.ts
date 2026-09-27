import type { VenueStatus } from '@jordan-sports/contracts';

/** Allowed venue status transitions (admin-driven in the pilot). */
export const venueTransitions: Record<VenueStatus, readonly VenueStatus[]> = {
  draft: ['submitted', 'approved', 'rejected'],
  submitted: ['approved', 'rejected', 'draft'],
  approved: ['suspended'],
  suspended: ['approved'],
  rejected: ['draft'],
};

export function canTransition(from: VenueStatus, to: VenueStatus): boolean {
  return venueTransitions[from].includes(to);
}
