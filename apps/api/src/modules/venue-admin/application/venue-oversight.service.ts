import { Inject, Injectable } from '@nestjs/common';
import type { VenueRating, VenueRatingTag, VenueStats } from '@jordan-sports/contracts';
import { sql } from 'kysely';
import type { Db, Tx } from '../../../platform/database/database.js';
import { DATABASE } from '../../../platform/database/database.module.js';
import { uuidv7 } from '../../../platform/database/ids.js';
import { bypassTenant } from '../../../platform/database/tenant.js';
import { transaction } from '../../../platform/database/transaction.js';
import { AppError, Errors } from '../../../platform/http/errors.js';
import type { RequestMeta } from '../../../platform/http/request-context.js';
import { AuditService } from '../../audit/index.js';
import { CatalogService } from '../../catalog/index.js';

interface Caller {
  readonly type: 'admin' | 'user';
  readonly userId: string;
  readonly meta: RequestMeta;
}

type Localized = { ar?: string; en?: string };

const normalizeName = (s: string) => s.trim().replace(/\s+/g, ' ').toLocaleLowerCase();

/**
 * The owner's oversight of venues (docs/rbac-plan.md §7.2–7.3): archive (soft delete), private
 * ratings, and performance figures.
 */
@Injectable()
export class VenueOversightService {
  constructor(
    @Inject(DATABASE) private readonly db: Db,
    private readonly audit: AuditService,
    private readonly catalog: CatalogService,
  ) {}

  private async ensureVenue(db: Db | Tx, venueId: string) {
    const venue = await db
      .selectFrom('venue.venues')
      .select(['id', 'organization_id', 'name', 'status'])
      .where('id', '=', venueId)
      .where('archived_at', 'is', null)
      .executeTakeFirst();
    if (!venue) throw Errors.notFound();
    return venue;
  }

  /**
   * Soft delete. The caller types the venue's name to confirm; refused while bookings are still
   * to come (cancel or move them first) so no player is left with a booking at a hidden venue.
   */
  async archive(
    caller: Caller,
    venueId: string,
    input: { confirmName: string; reason: string },
  ): Promise<void> {
    await transaction(this.db, async (tx) => {
      await bypassTenant(tx);
      const venue = await tx
        .selectFrom('venue.venues')
        .select(['id', 'organization_id', 'name', 'status'])
        .where('id', '=', venueId)
        .where('archived_at', 'is', null)
        .forUpdate()
        .executeTakeFirst();
      if (!venue) throw Errors.notFound();
      const names = Object.values(venue.name as Localized)
        .filter((n): n is string => typeof n === 'string')
        .map(normalizeName);
      if (!names.includes(normalizeName(input.confirmName))) {
        throw new AppError('VALIDATION_FAILED', 400, 'The typed name does not match the venue');
      }
      const upcoming = await tx
        .selectFrom('booking.bookings')
        .select((eb) => eb.fn.countAll<string>().as('n'))
        .where('venue_id', '=', venueId)
        .where('status', 'in', ['HELD', 'CONFIRMED'])
        .where(sql<boolean>`upper(during) > now()`)
        .executeTakeFirstOrThrow();
      if (Number(upcoming.n) > 0) {
        throw new AppError(
          'INVALID_STATE_TRANSITION',
          409,
          `The venue still has ${upcoming.n} upcoming booking(s)`,
          { upcomingBookings: Number(upcoming.n) },
        );
      }
      const archivedAt = new Date();
      await tx
        .updateTable('venue.venues')
        .set({ archived_at: archivedAt })
        .where('id', '=', venueId)
        .execute();
      await this.audit.record(
        {
          actorType: caller.type,
          actorUserId: caller.userId,
          action: 'venue.archived',
          targetType: 'venue',
          targetId: venueId,
          organizationId: venue.organization_id,
          reason: input.reason,
          details: {
            before: { status: venue.status, archivedAt: null },
            after: { status: venue.status, archivedAt: archivedAt.toISOString() },
          },
          meta: caller.meta,
        },
        tx,
      );
    });
    this.catalog.invalidate();
  }

  async ratings(venueId: string): Promise<{ current: VenueRating | null; history: VenueRating[] }> {
    await this.ensureVenue(this.db, venueId);
    const rows = await this.db
      .selectFrom('platform.venue_ratings')
      .select(['id', 'score', 'tags', 'note', 'created_at'])
      .where('venue_id', '=', venueId)
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc')
      .limit(100)
      .execute();
    const history = rows.map((r): VenueRating => ({
      id: r.id,
      score: r.score,
      tags: r.tags as VenueRatingTag[],
      note: r.note,
      createdAt: r.created_at.toISOString(),
    }));
    return { current: history[0] ?? null, history };
  }

  async rate(
    caller: Caller,
    venueId: string,
    input: { score: number; tags: VenueRatingTag[]; note?: string | undefined },
  ) {
    const venue = await this.ensureVenue(this.db, venueId);
    await this.db.transaction().execute(async (tx) => {
      await tx
        .insertInto('platform.venue_ratings')
        .values({
          id: uuidv7(),
          venue_id: venueId,
          score: input.score,
          tags: [...new Set(input.tags)],
          note: input.note?.trim() || null,
          created_by: caller.userId,
        })
        .execute();
      // The audit entry says a rating was recorded, not its content (kept private).
      await this.audit.record(
        {
          actorType: 'admin',
          actorUserId: caller.userId,
          action: 'venue.privately_rated',
          targetType: 'venue',
          targetId: venueId,
          organizationId: venue.organization_id,
          meta: caller.meta,
        },
        tx,
      );
    });
    return this.ratings(venueId);
  }

  async stats(venueId: string, days: number, withRevenue: boolean): Promise<VenueStats> {
    return transaction(this.db, async (tx) => {
      await bypassTenant(tx);
      const venue = await tx
        .selectFrom('venue.venues')
        .select(['id', 'currency', 'timezone'])
        .where('id', '=', venueId)
        .executeTakeFirst();
      if (!venue) throw Errors.notFound();
      const to = new Date();
      const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
      const row = await tx
        .selectFrom('booking.bookings')
        .select((eb) => [
          eb.fn.countAll<string>().as('total'),
          sql<string>`count(*) FILTER (WHERE status = 'CONFIRMED')`.as('confirmed'),
          sql<string>`count(*) FILTER (WHERE status = 'COMPLETED')`.as('completed'),
          sql<string>`count(*) FILTER (WHERE status = 'CANCELLED')`.as('cancelled'),
          sql<string>`count(*) FILTER (WHERE status = 'CANCELLED' AND late_cancellation)`.as(
            'late',
          ),
          sql<string>`count(*) FILTER (WHERE status = 'NO_SHOW')`.as('no_show'),
          sql<string>`count(*) FILTER (WHERE channel = 'MARKETPLACE')`.as('online'),
          sql<string>`count(*) FILTER (WHERE channel = 'VENUE_MANUAL')`.as('manual'),
          sql<string>`coalesce(sum(total) FILTER (WHERE status IN ('CONFIRMED', 'COMPLETED')), 0)`.as(
            'revenue',
          ),
        ])
        .where('venue_id', '=', venueId)
        .where('status', '!=', 'EXPIRED')
        .where(sql<boolean>`lower(during) >= ${from}`)
        .where(sql<boolean>`lower(during) < ${to}`)
        .executeTakeFirstOrThrow();
      return {
        from: from.toISOString(),
        to: to.toISOString(),
        bookings: {
          total: Number(row.total),
          confirmed: Number(row.confirmed),
          completed: Number(row.completed),
          cancelled: Number(row.cancelled),
          lateCancellations: Number(row.late),
          noShows: Number(row.no_show),
          online: Number(row.online),
          byVenue: Number(row.manual),
        },
        revenue: withRevenue ? { amount: Number(row.revenue), currency: venue.currency } : null,
      };
    });
  }
}
