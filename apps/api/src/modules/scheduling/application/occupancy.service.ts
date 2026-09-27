import { Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import type { DbOrTx, Tx } from '../../../platform/database/database.js';
import { pgConstraint, pgErrorCode, PgError } from '../../../platform/database/errors.js';
import { uuidv7 } from '../../../platform/database/ids.js';
import type { Interval } from '../domain/availability.js';

export class OccupancyConflictError extends Error {
  override readonly name = 'OccupancyConflictError';
}

export interface OccupyInput {
  readonly venueId: string;
  readonly unitIds: readonly string[];
  readonly during: Interval;
  readonly kind: 'hold' | 'booking' | 'block';
  readonly blockId?: string;
  readonly bookingId?: string;
  readonly expiresAt?: Date;
}

export interface OccupancyRow {
  id: string;
  unitId: string;
  start: Date;
  end: Date;
  kind: 'hold' | 'booking' | 'block';
  blockId: string | null;
  bookingId: string | null;
}

/** tstzrange built from parameters (half-open, ADR-0004). */
export function tstzrange(interval: Interval) {
  return sql<string>`tstzrange(${interval.start.toISOString()}::timestamptz, ${interval.end.toISOString()}::timestamptz, '[)')`;
}

/**
 * All writes to `scheduling.occupancies` go through here. The database exclusion constraint is the
 * guarantee; this translates its violation into a typed error (never retried).
 */
@Injectable()
export class OccupancyService {
  /**
   * Inserts one active occupancy per unit inside the caller's transaction. A savepoint keeps a
   * conflict from aborting the surrounding transaction.
   */
  async occupy(tx: Tx, input: OccupyInput): Promise<void> {
    if (input.unitIds.length === 0) throw new Error('A resource without units cannot be occupied');
    await this.lockUnits(tx, input.unitIds);
    await sql`SAVEPOINT occupy`.execute(tx);
    try {
      await tx
        .insertInto('scheduling.occupancies')
        .values(
          // Sorted so concurrent transactions touch units in the same order.
          [...input.unitIds].sort().map((unitId) => ({
            id: uuidv7(),
            venue_id: input.venueId,
            unit_id: unitId,
            during: tstzrange(input.during),
            kind: input.kind,
            expires_at: input.expiresAt ?? null,
            block_id: input.blockId ?? null,
            booking_id: input.bookingId ?? null,
          })),
        )
        .execute();
      await sql`RELEASE SAVEPOINT occupy`.execute(tx);
    } catch (error) {
      await sql`ROLLBACK TO SAVEPOINT occupy`.execute(tx);
      if (
        pgErrorCode(error) === PgError.exclusionViolation &&
        pgConstraint(error) === 'occupancies_no_overlap'
      ) {
        throw new OccupancyConflictError('Time is already occupied');
      }
      throw error;
    }
  }

  /**
   * Serializes writers per unit for the rest of the transaction (re-entrant, sorted to avoid lock
   * cycles). Without it, concurrent inserts checking the exclusion constraint can deadlock each
   * other repeatedly under heavy contention. Call it before touching other rows of the same slot.
   */
  async lockUnits(tx: Tx, unitIds: readonly string[]): Promise<void> {
    for (const unitId of [...new Set(unitIds)].sort()) {
      await sql`SELECT pg_advisory_xact_lock(hashtextextended(${unitId}, 0))`.execute(tx);
    }
  }

  /**
   * Active occupancies of the given units overlapping `window`. Holds past their expiry are ignored:
   * they no longer block anyone, even before they are released.
   */
  async activeFor(
    db: DbOrTx,
    unitIds: readonly string[],
    window: Interval,
    now: Date,
  ): Promise<OccupancyRow[]> {
    if (unitIds.length === 0) return [];
    const rows = await db
      .selectFrom('scheduling.occupancies')
      .select([
        'id',
        'unit_id',
        'kind',
        'block_id',
        'booking_id',
        sql<Date>`lower(during)`.as('start'),
        sql<Date>`upper(during)`.as('end'),
      ])
      .where('unit_id', 'in', unitIds)
      .where('active', '=', true)
      .where(sql<boolean>`during && ${tstzrange(window)}`)
      .where((eb) => eb.or([eb('kind', '<>', 'hold'), eb('expires_at', '>', now)]))
      .execute();
    return rows.map((r) => ({
      id: r.id,
      unitId: r.unit_id,
      start: new Date(r.start),
      end: new Date(r.end),
      kind: r.kind as OccupancyRow['kind'],
      blockId: r.block_id,
      bookingId: r.booking_id,
    }));
  }

  async releaseBlock(tx: Tx, blockId: string): Promise<void> {
    await tx
      .updateTable('scheduling.occupancies')
      .set({ active: false })
      .where('block_id', '=', blockId)
      .execute();
  }
}
