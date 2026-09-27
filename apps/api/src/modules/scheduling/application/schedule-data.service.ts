import { Inject, Injectable } from '@nestjs/common';
import type { BookingPolicy, WeeklyWindow } from '@jordan-sports/contracts';
import { z } from 'zod';
import type { Db, DbOrTx } from '../../../platform/database/database.js';
import { DATABASE } from '../../../platform/database/database.module.js';
import type { DateOverride, Window } from '../domain/availability.js';
import { addDays } from '../domain/venue-time.js';

const windowsSchema = z.array(
  z.object({ startMinute: z.number().int(), durationMinutes: z.number().int() }),
);

export interface StoredOverride {
  id: string;
  resourceId: string | null;
  dateFrom: string;
  dateTo: string;
  kind: 'closed' | 'hours';
  windows: Window[];
  note: string | null;
}

export interface PolicyRow extends BookingPolicy {
  holdMinutes: number;
}

/** Reads schedule configuration (hours, rules, overrides, holidays). */
@Injectable()
export class ScheduleDataService {
  constructor(@Inject(DATABASE) private readonly db: Db) {}

  async weeklyHours(
    resourceIds: readonly string[],
    db: DbOrTx = this.db,
  ): Promise<Map<string, WeeklyWindow[]>> {
    const map = new Map<string, WeeklyWindow[]>(resourceIds.map((id) => [id, []]));
    if (resourceIds.length === 0) return map;
    const rows = await db
      .selectFrom('scheduling.weekly_hours')
      .select(['resource_id', 'day_of_week', 'start_minute', 'duration_minutes'])
      .where('resource_id', 'in', resourceIds)
      .orderBy('day_of_week')
      .orderBy('start_minute')
      .execute();
    for (const r of rows) {
      map.get(r.resource_id)?.push({
        dayOfWeek: r.day_of_week,
        startMinute: r.start_minute,
        durationMinutes: r.duration_minutes,
      });
    }
    return map;
  }

  async policies(
    resourceIds: readonly string[],
    db: DbOrTx = this.db,
  ): Promise<Map<string, PolicyRow>> {
    if (resourceIds.length === 0) return new Map();
    const rows = await db
      .selectFrom('resource.booking_policies')
      .selectAll()
      .where('resource_id', 'in', resourceIds)
      .execute();
    return new Map(
      rows.map((r) => [
        r.resource_id,
        {
          slotDurations: r.slot_durations,
          startAlignmentMinutes: r.start_alignment_minutes as 15 | 30 | 60,
          minLeadMinutes: r.min_lead_minutes,
          maxAdvanceDays: r.max_advance_days,
          bufferBeforeMinutes: r.buffer_before_minutes,
          bufferAfterMinutes: r.buffer_after_minutes,
          holdMinutes: r.hold_minutes,
        },
      ]),
    );
  }

  async overrides(
    venueId: string,
    range?: { from: string; to: string },
    db: DbOrTx = this.db,
  ): Promise<StoredOverride[]> {
    let query = db
      .selectFrom('scheduling.date_overrides')
      .select(['id', 'resource_id', 'date_from', 'date_to', 'kind', 'windows', 'note'])
      .where('venue_id', '=', venueId)
      .orderBy('date_from');
    if (range) query = query.where('date_to', '>=', range.from).where('date_from', '<=', range.to);
    const rows = await query.execute();
    return rows.map((r) => ({
      id: r.id,
      resourceId: r.resource_id,
      dateFrom: String(r.date_from),
      dateTo: String(r.date_to),
      kind: r.kind as 'closed' | 'hours',
      windows: windowsSchema.parse(r.windows),
      note: r.note,
    }));
  }

  /** Overrides relevant to one resource, flagged resource-specific or venue-wide. */
  forResource(overrides: readonly StoredOverride[], resourceId: string): DateOverride[] {
    return overrides
      .filter((o) => o.resourceId === null || o.resourceId === resourceId)
      .map((o) => ({
        dateFrom: o.dateFrom,
        dateTo: o.dateTo,
        kind: o.kind,
        windows: o.windows,
        resourceSpecific: o.resourceId !== null,
      }));
  }

  /** Public-holiday dates around `date` on which the venue is closed (if it opted in). */
  async closedDates(venueId: string, date: string, db: DbOrTx = this.db): Promise<Set<string>> {
    const venue = await db
      .selectFrom('venue.venues as v')
      .innerJoin('catalog.cities as c', 'c.id', 'v.city_id')
      .select(['v.closed_on_public_holidays', 'c.country_code'])
      .where('v.id', '=', venueId)
      .executeTakeFirst();
    if (!venue?.closed_on_public_holidays) return new Set();
    const rows = await db
      .selectFrom('scheduling.holidays')
      .select('date')
      .where('country_code', '=', venue.country_code)
      .where('date', '>=', addDays(date, -1))
      .where('date', '<=', addDays(date, 1))
      .execute();
    return new Set(rows.map((r) => String(r.date)));
  }

  async closedOnPublicHolidays(venueId: string): Promise<boolean> {
    const row = await this.db
      .selectFrom('venue.venues')
      .select('closed_on_public_holidays')
      .where('id', '=', venueId)
      .executeTakeFirst();
    return row?.closed_on_public_holidays ?? false;
  }
}
