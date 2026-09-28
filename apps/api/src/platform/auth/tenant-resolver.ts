import { Inject, Injectable } from '@nestjs/common';
import type { MembershipRole } from '@jordan-sports/contracts';
import { sql, type RawBuilder } from 'kysely';
import type { Db } from '../database/database.js';
import { DATABASE } from '../database/database.module.js';

/**
 * Which organization owns the resource named in a venue-API path. Resolved from the database,
 * never from the request body (ADR-0008). The first parameter found, in this order, decides.
 */
type OwnerQuery = (id: string) => RawBuilder<{ organization_id: string }>;

const OWNER_QUERIES: ReadonlyArray<[param: string, query: OwnerQuery]> = [
  [
    'venueId',
    (id) =>
      sql`SELECT organization_id FROM venue.venues WHERE id = ${id}::uuid AND archived_at IS NULL`,
  ],
  [
    'resourceId',
    (id) => sql`SELECT v.organization_id FROM resource.resources r
      JOIN venue.venues v ON v.id = r.venue_id WHERE r.id = ${id}::uuid AND v.archived_at IS NULL`,
  ],
  ['bookingId', (id) => sql`SELECT organization_id FROM booking.bookings WHERE id = ${id}::uuid`],
  [
    'blockId',
    (id) => sql`SELECT v.organization_id FROM scheduling.blocks b
      JOIN venue.venues v ON v.id = b.venue_id WHERE b.id = ${id}::uuid`,
  ],
  [
    'overrideId',
    (id) => sql`SELECT v.organization_id FROM scheduling.date_overrides o
      JOIN venue.venues v ON v.id = o.venue_id WHERE o.id = ${id}::uuid`,
  ],
  [
    'ruleId',
    (id) => sql`SELECT v.organization_id FROM pricing.price_rules p
      JOIN venue.venues v ON v.id = p.venue_id WHERE p.id = ${id}::uuid`,
  ],
  [
    'mediaId',
    (id) => sql`SELECT v.organization_id FROM venue.media m
      JOIN venue.venues v ON v.id = m.venue_id WHERE m.id = ${id}::uuid`,
  ],
  ['paymentId', (id) => sql`SELECT organization_id FROM payment.payments WHERE id = ${id}::uuid`],
  ['memberId', (id) => sql`SELECT organization_id FROM tenancy.memberships WHERE id = ${id}::uuid`],
];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class TenantResolver {
  constructor(@Inject(DATABASE) private readonly db: Db) {}

  /** The organization owning the path's resource; null when none (or not a valid id). */
  async organizationFor(params: Record<string, string | undefined>): Promise<string | null> {
    for (const [param, query] of OWNER_QUERIES) {
      const value = params[param];
      if (value === undefined) continue;
      if (!UUID.test(value)) return null;
      const r = await query(value).execute(this.db);
      return r.rows[0]?.organization_id ?? null;
    }
    return null;
  }

  async roleOf(userId: string, organizationId: string): Promise<MembershipRole | null> {
    const row = await this.db
      .selectFrom('tenancy.memberships as m')
      .innerJoin('tenancy.organizations as o', 'o.id', 'm.organization_id')
      .select('m.role')
      .where('m.user_id', '=', userId)
      .where('m.organization_id', '=', organizationId)
      .where('o.status', '=', 'active')
      .executeTakeFirst();
    return (row?.role as MembershipRole | undefined) ?? null;
  }
}
