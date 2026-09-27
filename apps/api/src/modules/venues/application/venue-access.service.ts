import { Injectable } from '@nestjs/common';
import type { MembershipRole } from '@jordan-sports/contracts';
import { MembershipsService, type OrgPermission } from '../../tenancy/index.js';
import { VenuesService, type VenueRow } from './venues.service.js';

/**
 * Tenant authorization for venue-scoped operations (ADR-0008): the organization is taken from the
 * venue record in the database, never from the request. Non-members get 404.
 */
@Injectable()
export class VenueAccessService {
  constructor(
    private readonly venues: VenuesService,
    private readonly memberships: MembershipsService,
  ) {}

  async require(
    userId: string,
    venueId: string,
    permission: OrgPermission,
  ): Promise<{ venue: VenueRow; role: MembershipRole }> {
    const venue = await this.venues.find(venueId);
    const role = await this.memberships.require(userId, venue.organizationId, permission);
    return { venue, role };
  }
}
