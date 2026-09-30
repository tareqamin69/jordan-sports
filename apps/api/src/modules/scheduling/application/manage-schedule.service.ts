import { Inject, Injectable } from '@nestjs/common';
import type {
  BlockReason,
  BookingPolicy,
  CalendarEntry,
  VenueCalendar,
  VenueSchedule,
  WeeklyWindow,
} from '@jordan-sports/contracts';
import type { Db } from '../../../platform/database/database.js';
import { DATABASE } from '../../../platform/database/database.module.js';
import { uuidv7 } from '../../../platform/database/ids.js';
import { setTenant } from '../../../platform/database/tenant.js';
import { transaction } from '../../../platform/database/transaction.js';
import { AppError, Errors } from '../../../platform/http/errors.js';
import type { RequestMeta } from '../../../platform/http/request-context.js';
import { AuditService } from '../../audit/index.js';
import { overlapping, ResourcesService } from '../../resources/index.js';
import { orgRolePermissions } from '../../tenancy/domain/org-permissions.js';
import { VenueAccessService } from '../../venues/index.js';
import { openIntervals, type Interval } from '../domain/availability.js';
import {
  addDays,
  businessDayRange,
  instantToLocal,
  localToInstant,
  parseTime,
} from '../domain/venue-time.js';
import { AvailabilityService } from './availability.service.js';
import { OccupancyConflictError, OccupancyService, tstzrange } from './occupancy.service.js';
import { ScheduleDataService } from './schedule-data.service.js';

type Localized = { ar?: string; en?: string };

export interface StaffActor {
  readonly userId: string;
  readonly meta: RequestMeta;
}

function assertWindowsDoNotOverlap(windows: readonly WeeklyWindow[]): void {
  // Compare on a weekly timeline (minutes since Monday 00:00), wrapping around the week end.
  const WEEK = 7 * 1440;
  const ranges = windows.map((w) => ({
    start: (w.dayOfWeek - 1) * 1440 + w.startMinute,
    end: (w.dayOfWeek - 1) * 1440 + w.startMinute + w.durationMinutes,
  }));
  for (let i = 0; i < ranges.length; i++) {
    for (let j = i + 1; j < ranges.length; j++) {
      const a = ranges[i]!;
      const b = ranges[j]!;
      for (const shift of [-WEEK, 0, WEEK]) {
        if (a.start < b.end + shift && b.start + shift < a.end) {
          throw new AppError('VALIDATION_FAILED', 400, 'Opening windows overlap');
        }
      }
    }
  }
}

/** Venue staff scheduling operations (/manage). Every method authorizes against the venue's organization. */
@Injectable()
export class ManageScheduleService {
  constructor(
    @Inject(DATABASE) private readonly db: Db,
    private readonly access: VenueAccessService,
    private readonly resources: ResourcesService,
    private readonly data: ScheduleDataService,
    private readonly availability: AvailabilityService,
    private readonly occupancy: OccupancyService,
    private readonly audit: AuditService,
  ) {}

  async listVenues(userId: string) {
    const rows = await this.db
      .selectFrom('tenancy.memberships as m')
      .innerJoin('tenancy.organizations as o', 'o.id', 'm.organization_id')
      .innerJoin('venue.venues as v', 'v.organization_id', 'o.id')
      .select([
        'v.id',
        'v.slug',
        'v.name',
        'v.status',
        'v.status_reason',
        'o.id as organization_id',
        'o.name as organization_name',
        'm.role',
        (eb) =>
          eb
            .selectFrom('venue.media as med')
            .select('med.id')
            .whereRef('med.venue_id', '=', 'v.id')
            .orderBy('med.sort_order')
            .orderBy('med.created_at')
            .limit(1)
            .as('cover_media_id'),
      ])
      .where('m.user_id', '=', userId)
      .where('o.status', '=', 'active')
      .where('v.archived_at', 'is', null)
      .orderBy('v.created_at')
      .execute();
    return {
      items: rows.map((r) => ({
        id: r.id,
        slug: r.slug,
        name: r.name as Localized,
        status: r.status as VenueSchedule['venue']['status'],
        statusReason: r.status_reason,
        organizationId: r.organization_id,
        organizationName: r.organization_name as Localized,
        role: r.role as VenueSchedule['role'],
        coverMediaId: r.cover_media_id,
      })),
    };
  }

  private async resourceVenue(
    userId: string,
    resourceId: string,
    permission: 'schedule.hours' | 'schedule.rules',
  ) {
    const resource = await this.resources.find(resourceId);
    const { venue } = await this.access.require(userId, resource.venueId, permission);
    return { resource, venue };
  }

  async schedule(userId: string, venueId: string): Promise<VenueSchedule> {
    const { venue, role } = await this.access.require(userId, venueId, 'venue.read');
    const resources = await this.resources.listForVenue(venueId);
    const ids = resources.map((r) => r.id);
    const [weekly, policies, overrides, closedOnPublicHolidays] = await Promise.all([
      this.data.weeklyHours(ids),
      this.data.policies(ids),
      this.data.overrides(venueId),
      this.data.closedOnPublicHolidays(venueId),
    ]);
    return {
      venue: {
        id: venue.id,
        slug: venue.slug,
        name: venue.name,
        status: venue.status,
        timezone: venue.timezone,
        businessDayStartMinute: venue.businessDayStartMinute,
        closedOnPublicHolidays,
        cancellationCutoffHours: venue.cancellationCutoffHours,
        lateRefundPercent: venue.lateRefundPercent,
      },
      role,
      permissions: [...orgRolePermissions[role]],
      resources: resources.map((r) => {
        const { holdMinutes: _hold, ...policy } = policies.get(r.id)!;
        return {
          id: r.id,
          name: r.name,
          status: r.status,
          weeklyHours: weekly.get(r.id) ?? [],
          policy,
          overlapsWith: overlapping(r, resources),
        };
      }),
      overrides: overrides.map((o) => ({ ...o })),
    };
  }

  async setWeeklyHours(
    actor: StaffActor,
    resourceId: string,
    windows: WeeklyWindow[],
  ): Promise<VenueSchedule> {
    const { venue } = await this.resourceVenue(actor.userId, resourceId, 'schedule.hours');
    assertWindowsDoNotOverlap(windows);
    await this.db.transaction().execute(async (tx) => {
      await tx
        .deleteFrom('scheduling.weekly_hours')
        .where('resource_id', '=', resourceId)
        .execute();
      if (windows.length > 0) {
        await tx
          .insertInto('scheduling.weekly_hours')
          .values(
            windows.map((w) => ({
              id: uuidv7(),
              resource_id: resourceId,
              day_of_week: w.dayOfWeek,
              start_minute: w.startMinute,
              duration_minutes: w.durationMinutes,
            })),
          )
          .execute();
      }
      await this.audit.record(
        {
          actorType: 'user',
          actorUserId: actor.userId,
          action: 'schedule.hours_updated',
          targetType: 'resource',
          targetId: resourceId,
          organizationId: venue.organizationId,
          details: { windows: windows.length },
          meta: actor.meta,
        },
        tx,
      );
    });
    return this.schedule(actor.userId, venue.id);
  }

  async setPolicy(
    actor: StaffActor,
    resourceId: string,
    policy: BookingPolicy,
  ): Promise<VenueSchedule> {
    const { venue } = await this.resourceVenue(actor.userId, resourceId, 'schedule.rules');
    await this.db.transaction().execute(async (tx) => {
      await tx
        .updateTable('resource.booking_policies')
        .set({
          slot_durations: [...new Set(policy.slotDurations)].sort((a, b) => a - b),
          start_alignment_minutes: policy.startAlignmentMinutes,
          min_lead_minutes: policy.minLeadMinutes,
          max_advance_days: policy.maxAdvanceDays,
          buffer_before_minutes: policy.bufferBeforeMinutes,
          buffer_after_minutes: policy.bufferAfterMinutes,
          updated_at: new Date(),
        })
        .where('resource_id', '=', resourceId)
        .execute();
      await this.audit.record(
        {
          actorType: 'user',
          actorUserId: actor.userId,
          action: 'schedule.policy_updated',
          targetType: 'resource',
          targetId: resourceId,
          organizationId: venue.organizationId,
          details: { ...policy },
          meta: actor.meta,
        },
        tx,
      );
    });
    return this.schedule(actor.userId, venue.id);
  }

  async updateSettings(
    actor: StaffActor,
    venueId: string,
    settings: {
      closedOnPublicHolidays?: boolean | undefined;
      cancellationCutoffHours?: number | undefined;
      lateRefundPercent?: 0 | 50 | 100 | undefined;
    },
  ): Promise<VenueSchedule> {
    const { venue } = await this.access.require(actor.userId, venueId, 'schedule.rules');
    const { closedOnPublicHolidays, cancellationCutoffHours, lateRefundPercent } = settings;
    if (
      closedOnPublicHolidays === undefined &&
      cancellationCutoffHours === undefined &&
      lateRefundPercent === undefined
    ) {
      return this.schedule(actor.userId, venueId);
    }
    await this.db.transaction().execute(async (tx) => {
      await tx
        .updateTable('venue.venues')
        .set({
          ...(closedOnPublicHolidays !== undefined
            ? { closed_on_public_holidays: closedOnPublicHolidays }
            : {}),
          ...(cancellationCutoffHours !== undefined
            ? { cancellation_cutoff_hours: cancellationCutoffHours }
            : {}),
          ...(lateRefundPercent !== undefined ? { late_refund_percent: lateRefundPercent } : {}),
        })
        .where('id', '=', venueId)
        .execute();
      await this.audit.record(
        {
          actorType: 'user',
          actorUserId: actor.userId,
          action: 'schedule.settings_updated',
          targetType: 'venue',
          targetId: venueId,
          organizationId: venue.organizationId,
          details: { closedOnPublicHolidays, cancellationCutoffHours, lateRefundPercent },
          meta: actor.meta,
        },
        tx,
      );
    });
    return this.schedule(actor.userId, venueId);
  }

  async createOverride(
    actor: StaffActor,
    venueId: string,
    input: {
      resourceId?: string | null;
      dateFrom: string;
      dateTo: string;
      kind: 'closed' | 'hours';
      windows: Array<{ startMinute: number; durationMinutes: number }>;
      note?: string;
    },
  ): Promise<VenueSchedule> {
    const { venue } = await this.access.require(actor.userId, venueId, 'schedule.closures');
    if (input.dateTo < input.dateFrom || input.dateTo > addDays(input.dateFrom, 366)) {
      throw new AppError('VALIDATION_FAILED', 400, 'Invalid date range');
    }
    if (input.kind === 'hours' && input.windows.length === 0) {
      throw new AppError('VALIDATION_FAILED', 400, 'Special hours need at least one window');
    }
    if (input.resourceId) {
      const resource = await this.resources.find(input.resourceId);
      if (resource.venueId !== venueId) throw Errors.notFound();
    }
    await this.db.transaction().execute(async (tx) => {
      const id = uuidv7();
      await tx
        .insertInto('scheduling.date_overrides')
        .values({
          id,
          venue_id: venueId,
          resource_id: input.resourceId ?? null,
          date_from: input.dateFrom,
          date_to: input.dateTo,
          kind: input.kind,
          windows: JSON.stringify(input.kind === 'hours' ? input.windows : []),
          note: input.note ?? null,
          created_by: actor.userId,
        })
        .execute();
      await this.audit.record(
        {
          actorType: 'user',
          actorUserId: actor.userId,
          action: 'schedule.override_created',
          targetType: 'override',
          targetId: id,
          organizationId: venue.organizationId,
          details: { dateFrom: input.dateFrom, dateTo: input.dateTo, kind: input.kind },
          meta: actor.meta,
        },
        tx,
      );
    });
    return this.schedule(actor.userId, venueId);
  }

  async deleteOverride(actor: StaffActor, overrideId: string): Promise<VenueSchedule> {
    const row = await this.db
      .selectFrom('scheduling.date_overrides')
      .select('venue_id')
      .where('id', '=', overrideId)
      .executeTakeFirst();
    if (!row) throw Errors.notFound();
    const { venue } = await this.access.require(actor.userId, row.venue_id, 'schedule.closures');
    await this.db.transaction().execute(async (tx) => {
      await tx.deleteFrom('scheduling.date_overrides').where('id', '=', overrideId).execute();
      await this.audit.record(
        {
          actorType: 'user',
          actorUserId: actor.userId,
          action: 'schedule.override_deleted',
          targetType: 'override',
          targetId: overrideId,
          organizationId: venue.organizationId,
          meta: actor.meta,
        },
        tx,
      );
    });
    return this.schedule(actor.userId, venue.id);
  }

  /**
   * Blocks time on a resource. The occupancy exclusion constraint rejects overlaps with bookings,
   * holds or other blocks on any shared unit — the venue must cancel those explicitly first.
   */
  async createBlock(
    actor: StaffActor,
    venueId: string,
    input: {
      resourceId: string;
      date: string;
      startTime: string;
      durationMinutes: number;
      reason: BlockReason;
      note?: string;
    },
  ): Promise<{ blockId: string }> {
    const { venue } = await this.access.require(actor.userId, venueId, 'schedule.block');
    const resource = await this.resources.find(input.resourceId);
    if (resource.venueId !== venueId || resource.status === 'archived') throw Errors.notFound();
    const start = localToInstant(input.date, parseTime(input.startTime), venue.timezone);
    const during: Interval = {
      start,
      end: new Date(start.getTime() + input.durationMinutes * 60_000),
    };
    const blockId = uuidv7();
    try {
      await transaction(this.db, async (tx) => {
        await tx
          .insertInto('scheduling.blocks')
          .values({
            id: blockId,
            venue_id: venueId,
            resource_id: resource.id,
            during: tstzrange(during),
            reason: input.reason,
            note: input.note ?? null,
            created_by: actor.userId,
          })
          .execute();
        await this.occupancy.occupy(tx, {
          venueId,
          unitIds: resource.unitIds,
          during,
          kind: 'block',
          blockId,
        });
        await this.audit.record(
          {
            actorType: 'user',
            actorUserId: actor.userId,
            action: 'schedule.block_created',
            targetType: 'block',
            targetId: blockId,
            organizationId: venue.organizationId,
            details: {
              resourceId: resource.id,
              start: during.start.toISOString(),
              end: during.end.toISOString(),
              reason: input.reason,
            },
            meta: actor.meta,
          },
          tx,
        );
      });
    } catch (error) {
      if (error instanceof OccupancyConflictError) throw new AppError('SCHEDULE_CONFLICT', 409);
      throw error;
    }
    return { blockId };
  }

  async cancelBlock(actor: StaffActor, blockId: string): Promise<void> {
    const block = await this.db
      .selectFrom('scheduling.blocks')
      .select(['venue_id', 'cancelled_at'])
      .where('id', '=', blockId)
      .executeTakeFirst();
    if (!block) throw Errors.notFound();
    const { venue } = await this.access.require(actor.userId, block.venue_id, 'schedule.block');
    if (block.cancelled_at) return;
    await this.db.transaction().execute(async (tx) => {
      await tx
        .updateTable('scheduling.blocks')
        .set({ cancelled_at: new Date(), cancelled_by: actor.userId })
        .where('id', '=', blockId)
        .where('cancelled_at', 'is', null)
        .execute();
      await this.occupancy.releaseBlock(tx, blockId);
      await this.audit.record(
        {
          actorType: 'user',
          actorUserId: actor.userId,
          action: 'schedule.block_cancelled',
          targetType: 'block',
          targetId: blockId,
          organizationId: venue.organizationId,
          meta: actor.meta,
        },
        tx,
      );
    });
  }

  async calendar(
    userId: string,
    venueId: string,
    date: string,
    now = new Date(),
  ): Promise<VenueCalendar> {
    const { venue } = await this.access.require(userId, venueId, 'booking.read');
    this.availability.assertBusinessDate(venue, date, now);
    const resources = await this.resources.listForVenue(venueId);
    const day = businessDayRange(date, venue.businessDayStartMinute, venue.timezone);
    const inputs = await this.availability.inputs(venue, resources, date, now);
    const occupancies = await this.occupancy.activeFor(
      this.db,
      [...new Set(resources.flatMap((r) => r.unitIds))],
      day,
      now,
    );
    const blockIds = [
      ...new Set(occupancies.map((o) => o.blockId).filter((id): id is string => id !== null)),
    ];
    const blocks = blockIds.length
      ? await this.db
          .selectFrom('scheduling.blocks')
          .select(['id', 'resource_id', 'reason', 'note'])
          .where('id', 'in', blockIds)
          .execute()
      : [];
    const blockById = new Map(blocks.map((b) => [b.id, b]));
    const bookingById = await this.bookingSummaries(
      venue.organizationId,
      occupancies.map((o) => o.bookingId).filter((id): id is string => id !== null),
    );
    const dayMinutes = Math.round((day.end.getTime() - day.start.getTime()) / 60_000);

    const range = (start: Date, end: Date) => {
      const s = Math.max(start.getTime(), day.start.getTime());
      const e = Math.min(end.getTime(), day.end.getTime());
      return {
        start: new Date(s).toISOString(),
        end: new Date(e).toISOString(),
        localStart: instantToLocal(new Date(s), venue.timezone).time,
        localEnd: instantToLocal(new Date(e), venue.timezone).time,
        offsetMinutes: Math.round((s - day.start.getTime()) / 60_000),
        durationMinutes: Math.round((e - s) / 60_000),
      };
    };

    return {
      date,
      timezone: venue.timezone,
      dayStart: day.start.toISOString(),
      dayEnd: day.end.toISOString(),
      dayMinutes,
      resources: resources.map((r) => {
        const ctx = inputs.get(r.id);
        const units = new Set(r.unitIds);
        const seen = new Set<string>();
        const entries: CalendarEntry[] = [];
        for (const o of occupancies) {
          if (!units.has(o.unitId)) continue;
          const key = o.blockId ?? o.bookingId ?? o.id;
          if (seen.has(key)) continue;
          seen.add(key);
          const block = o.blockId ? blockById.get(o.blockId) : undefined;
          const booking = o.bookingId ? bookingById.get(o.bookingId) : undefined;
          const via = block?.resource_id ?? booking?.resourceId;
          entries.push({
            id: o.id,
            kind: o.kind,
            blockId: o.blockId,
            bookingId: o.bookingId,
            reason: (block?.reason as BlockReason | undefined) ?? null,
            note: block?.note ?? booking?.note ?? null,
            viaResourceId: via && via !== r.id ? via : null,
            customerName: booking?.customerName ?? null,
            ...range(o.start, o.end),
          });
        }
        entries.sort((a, b) => a.offsetMinutes - b.offsetMinutes);
        return {
          id: r.id,
          name: r.name,
          status: r.status,
          open: ctx ? openIntervals(ctx.input).map((i) => range(i.start, i.end)) : [],
          entries,
        };
      }),
    };
  }

  /** Resource and customer name of bookings shown in the calendar (tenant-scoped read). */
  private async bookingSummaries(organizationId: string, ids: readonly string[]) {
    const map = new Map<
      string,
      { resourceId: string; customerName: string | null; note: string | null }
    >();
    if (ids.length === 0) return map;
    const rows = await this.db.transaction().execute(async (tx) => {
      await setTenant(tx, organizationId);
      return tx
        .selectFrom('booking.bookings as b')
        .leftJoin('identity.users as u', 'u.id', 'b.customer_user_id')
        .leftJoin('booking.venue_customers as vc', 'vc.id', 'b.venue_customer_id')
        .select(['b.id', 'b.resource_id', 'b.note', 'u.display_name', 'vc.name as vc_name'])
        .where('b.id', 'in', [...new Set(ids)])
        .where('b.organization_id', '=', organizationId)
        .execute();
    });
    for (const r of rows) {
      map.set(r.id, {
        resourceId: r.resource_id,
        customerName: r.display_name ?? r.vc_name,
        note: r.note,
      });
    }
    return map;
  }
}
