import { Inject, Injectable } from '@nestjs/common';
import type { AvailabilitySlot } from '@jordan-sports/contracts';
import type { Db, DbOrTx } from '../../../platform/database/database.js';
import { DATABASE } from '../../../platform/database/database.module.js';
import { AppError, Errors } from '../../../platform/http/errors.js';
import { ResourcesService, type ResourceRow } from '../../resources/index.js';
import { VenuesService, type VenueRow } from '../../venues/index.js';
import { computeSlots, type AvailabilityInput, type Slot } from '../domain/availability.js';
import {
  addDays,
  businessDayRange,
  businessDateOf,
  DATE_PATTERN,
  instantToLocal,
} from '../domain/venue-time.js';
import { OccupancyService } from './occupancy.service.js';
import { ScheduleDataService, type PolicyRow } from './schedule-data.service.js';

const MAX_BUFFER_MS = 2 * 60 * 60_000;

export function toApiSlot(slot: Slot, zone: string): AvailabilitySlot {
  return {
    start: slot.start.toISOString(),
    end: slot.end.toISOString(),
    localStart: instantToLocal(slot.start, zone).time,
    localEnd: instantToLocal(slot.end, zone).time,
    durationMinutes: slot.durationMinutes,
    available: slot.available,
  };
}

export interface ResourceAvailabilityContext {
  readonly input: AvailabilityInput;
  readonly policy: PolicyRow;
}

/** Builds engine inputs from the database and computes availability (§H). */
@Injectable()
export class AvailabilityService {
  constructor(
    @Inject(DATABASE) private readonly db: Db,
    private readonly venues: VenuesService,
    private readonly resources: ResourcesService,
    private readonly data: ScheduleDataService,
    private readonly occupancy: OccupancyService,
  ) {}

  assertBusinessDate(venue: VenueRow, date: string, now: Date): void {
    const today = businessDateOf(now, venue.businessDayStartMinute, venue.timezone);
    if (!DATE_PATTERN.test(date) || date < addDays(today, -1) || date > addDays(today, 366)) {
      throw new AppError('VALIDATION_FAILED', 400, 'Date out of range');
    }
  }

  /** Engine inputs for resources of one venue on one business date. */
  async inputs(
    venue: VenueRow,
    resources: readonly ResourceRow[],
    date: string,
    now: Date,
    db: DbOrTx = this.db,
  ): Promise<Map<string, ResourceAvailabilityContext>> {
    const ids = resources.map((r) => r.id);
    const day = businessDayRange(date, venue.businessDayStartMinute, venue.timezone);
    const window = {
      start: new Date(day.start.getTime() - MAX_BUFFER_MS - 24 * 3_600_000),
      end: new Date(day.end.getTime() + MAX_BUFFER_MS),
    };
    const [weekly, policies, overrides, closedDates, busy] = await Promise.all([
      this.data.weeklyHours(ids, db),
      this.data.policies(ids, db),
      this.data.overrides(venue.id, { from: addDays(date, -1), to: addDays(date, 1) }, db),
      this.data.closedDates(venue.id, date, db),
      this.occupancy.activeFor(db, [...new Set(resources.flatMap((r) => r.unitIds))], window, now),
    ]);
    const result = new Map<string, ResourceAvailabilityContext>();
    for (const r of resources) {
      const policy = policies.get(r.id);
      if (!policy) continue;
      const units = new Set(r.unitIds);
      result.set(r.id, {
        policy,
        input: {
          timeZone: venue.timezone,
          businessDayStartMinute: venue.businessDayStartMinute,
          date,
          weeklyHours: weekly.get(r.id) ?? [],
          overrides: this.data.forResource(overrides, r.id),
          closedDates,
          busy: busy.filter((b) => units.has(b.unitId)),
          policy,
          now,
        },
      });
    }
    return result;
  }

  /**
   * Raw slots of every active resource of an approved venue on a business date. Prices are attached
   * by the composition layer (directory), which also decides what the public sees.
   */
  async slotsForVenue(slug: string, date: string, now = new Date()) {
    const venue = await this.venues.findBySlug(slug);
    if (!venue || venue.status !== 'approved') throw Errors.notFound();
    this.assertBusinessDate(venue, date, now);
    const resources = (await this.resources.listForVenue(venue.id)).filter(
      (r) => r.status === 'active',
    );
    const inputs = await this.inputs(venue, resources, date, now);
    return {
      venue,
      resources: resources.map((r) => {
        const entry = inputs.get(r.id);
        return { resource: r, slots: entry ? computeSlots(entry.input) : [] };
      }),
    };
  }
}
