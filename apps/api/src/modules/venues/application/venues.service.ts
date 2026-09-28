import { Inject, Injectable } from '@nestjs/common';
import type { VenueProfileInput, VenueStatus } from '@jordan-sports/contracts';
import { sql } from 'kysely';
import type { Db, DbOrTx } from '../../../platform/database/database.js';
import { DATABASE } from '../../../platform/database/database.module.js';
import { pgConstraint, pgErrorCode, PgError } from '../../../platform/database/errors.js';
import { uuidv7 } from '../../../platform/database/ids.js';
import { AppError, Errors } from '../../../platform/http/errors.js';
import type { RequestMeta } from '../../../platform/http/request-context.js';
import { AuditService } from '../../audit/index.js';
import { CatalogService } from '../../catalog/index.js';
import { normalizePhone } from '../../identity/index.js';
import { canTransition } from '../domain/venue-status.js';

type Localized = { ar?: string; en?: string };

export interface VenueRow {
  id: string;
  organizationId: string;
  slug: string;
  name: Localized;
  description: Localized;
  status: VenueStatus;
  timezone: string;
  currency: string;
  governorateId: string;
  areaId: string | null;
  address: Localized;
  location: { lat: number; lng: number } | null;
  contactPhone: string | null;
  businessDayStartMinute: number;
  cancellationCutoffHours: number;
  cliqAlias: string | null;
  cliqAliasHolder: string | null;
  depositPercentage: number | null;
  whatsappPhone: string | null;
  statusReason: string | null;
  createdAt: Date;
}

export interface Actor {
  readonly type: 'admin' | 'user' | 'system';
  /** Null for system actions (e.g. development seeding). */
  readonly userId: string | null;
  readonly meta: RequestMeta;
}

function phoneOrNull(input: string | null | undefined): string | null | undefined {
  if (input === undefined || input === null) return input;
  const phone = normalizePhone(input);
  if (!phone) throw new AppError('INVALID_PHONE', 400);
  return phone;
}

@Injectable()
export class VenuesService {
  constructor(
    @Inject(DATABASE) private readonly db: Db,
    private readonly catalog: CatalogService,
    private readonly audit: AuditService,
  ) {}

  private baseQuery(db: DbOrTx) {
    return db
      .selectFrom('venue.venues')
      .select([
        'id',
        'organization_id',
        'slug',
        'name',
        'description',
        'status',
        'timezone',
        'currency',
        'city_id',
        'area_id',
        'address',
        'contact_phone',
        'business_day_start_minute',
        'cancellation_cutoff_hours',
        'cliq_alias',
        'cliq_alias_holder',
        'deposit_percentage',
        'whatsapp_phone',
        'status_reason',
        'created_at',
        sql<number | null>`ST_Y(location::geometry)`.as('lat'),
        sql<number | null>`ST_X(location::geometry)`.as('lng'),
      ])
      .where('archived_at', 'is', null);
  }

  private toRow(
    r: Awaited<ReturnType<ReturnType<VenuesService['baseQuery']>['executeTakeFirstOrThrow']>>,
  ): VenueRow {
    return {
      id: r.id,
      organizationId: r.organization_id,
      slug: r.slug,
      name: r.name as Localized,
      description: r.description as Localized,
      status: r.status as VenueStatus,
      timezone: r.timezone,
      currency: r.currency,
      governorateId: r.city_id,
      areaId: r.area_id,
      address: r.address as Localized,
      location:
        r.lat !== null && r.lng !== null ? { lat: Number(r.lat), lng: Number(r.lng) } : null,
      contactPhone: r.contact_phone,
      businessDayStartMinute: r.business_day_start_minute,
      cancellationCutoffHours: r.cancellation_cutoff_hours,
      cliqAlias: r.cliq_alias,
      cliqAliasHolder: r.cliq_alias_holder,
      depositPercentage: r.deposit_percentage,
      whatsappPhone: r.whatsapp_phone,
      statusReason: r.status_reason,
      createdAt: r.created_at,
    };
  }

  async find(venueId: string, db: DbOrTx = this.db): Promise<VenueRow> {
    const row = await this.baseQuery(db).where('id', '=', venueId).executeTakeFirst();
    if (!row) throw Errors.notFound();
    return this.toRow(row);
  }

  async findBySlug(slug: string): Promise<VenueRow | null> {
    const row = await this.baseQuery(this.db).where('slug', '=', slug).executeTakeFirst();
    return row ? this.toRow(row) : null;
  }

  async listByOrganization(organizationId: string): Promise<VenueRow[]> {
    const rows = await this.baseQuery(this.db)
      .where('organization_id', '=', organizationId)
      .orderBy('created_at')
      .execute();
    return rows.map((r) => this.toRow(r));
  }

  /** Cross-organization review queue (admin console): all venues, optionally by status. */
  async listAll(status?: VenueStatus): Promise<VenueRow[]> {
    let query = this.baseQuery(this.db);
    if (status) query = query.where('status', '=', status);
    const rows = await query.orderBy('created_at').execute();
    return rows.map((r) => this.toRow(r));
  }

  async amenityIds(venueId: string, db: DbOrTx = this.db): Promise<string[]> {
    const rows = await db
      .selectFrom('venue.venue_amenities')
      .select('amenity_id')
      .where('venue_id', '=', venueId)
      .execute();
    return rows.map((r) => r.amenity_id);
  }

  async facilities(venueId: string, db: DbOrTx = this.db) {
    const rows = await db
      .selectFrom('venue.facilities')
      .select(['id', 'name'])
      .where('venue_id', '=', venueId)
      .where('archived_at', 'is', null)
      .orderBy('sort_order')
      .orderBy('created_at')
      .execute();
    return rows.map((r) => ({ id: r.id, name: r.name as Localized }));
  }

  private async writeProfile(
    tx: DbOrTx,
    venueId: string,
    input: Partial<Omit<VenueProfileInput, 'amenityIds'>> & { amenityIds?: string[] },
  ): Promise<void> {
    const values: Record<string, unknown> = {};
    if (input.slug !== undefined) values.slug = input.slug;
    if (input.name !== undefined) values.name = JSON.stringify(input.name);
    if (input.description !== undefined) values.description = JSON.stringify(input.description);
    if (input.address !== undefined) values.address = JSON.stringify(input.address);
    if (input.areaId !== undefined) values.area_id = input.areaId;
    if (input.governorateId !== undefined) values.city_id = input.governorateId;
    if (input.businessDayStartMinute !== undefined)
      values.business_day_start_minute = input.businessDayStartMinute;
    const phone = phoneOrNull(input.contactPhone);
    if (phone !== undefined) values.contact_phone = phone;
    const whatsapp = phoneOrNull(input.whatsapp);
    if (whatsapp !== undefined) values.whatsapp_phone = whatsapp;
    if (input.cliqAlias !== undefined) values.cliq_alias = input.cliqAlias;
    if (input.cliqAliasHolderName !== undefined)
      values.cliq_alias_holder = input.cliqAliasHolderName;
    if (input.depositPercentage !== undefined) values.deposit_percentage = input.depositPercentage;
    if (input.location !== undefined) {
      values.location =
        input.location === null
          ? null
          : sql`ST_SetSRID(ST_MakePoint(${input.location.lng}, ${input.location.lat}), 4326)::geography`;
    }
    if (Object.keys(values).length > 0) {
      await tx.updateTable('venue.venues').set(values).where('id', '=', venueId).execute();
    }
    if (input.amenityIds !== undefined) {
      await tx.deleteFrom('venue.venue_amenities').where('venue_id', '=', venueId).execute();
      if (input.amenityIds.length > 0) {
        await tx
          .insertInto('venue.venue_amenities')
          .values(
            [...new Set(input.amenityIds)].map((amenity_id) => ({ venue_id: venueId, amenity_id })),
          )
          .execute();
      }
    }
  }

  private async validateProfile(
    input: Partial<VenueProfileInput>,
    governorateId: string,
  ): Promise<void> {
    await this.catalog.governorate(governorateId);
    await this.catalog.assertArea(governorateId, input.areaId);
    if (input.amenityIds) await this.catalog.assertAmenities(input.amenityIds);
  }

  private rethrowSlug(error: unknown): never {
    if (pgErrorCode(error) === PgError.uniqueViolation && pgConstraint(error)?.includes('slug')) {
      throw Errors.conflict('SLUG_TAKEN');
    }
    throw error;
  }

  async create(organizationId: string, input: VenueProfileInput, actor: Actor): Promise<string> {
    await this.validateProfile(input, input.governorateId);
    const governorate = await this.catalog.governorate(input.governorateId);
    const org = await this.db
      .selectFrom('tenancy.organizations')
      .select('id')
      .where('id', '=', organizationId)
      .executeTakeFirst();
    if (!org) throw Errors.notFound();
    const id = uuidv7();
    try {
      await this.db.transaction().execute(async (tx) => {
        await tx
          .insertInto('venue.venues')
          .values({
            id,
            organization_id: organizationId,
            slug: input.slug,
            name: JSON.stringify(input.name),
            city_id: input.governorateId,
            timezone: governorate.timezone,
          })
          .execute();
        await this.writeProfile(tx, id, {
          ...input,
          slug: undefined,
          name: undefined,
          governorateId: undefined,
        });
        await this.audit.record(
          {
            actorType: actor.type,
            actorUserId: actor.userId,
            action: 'venue.created',
            targetType: 'venue',
            targetId: id,
            organizationId,
            details: { slug: input.slug },
            meta: actor.meta,
          },
          tx,
        );
      });
    } catch (error) {
      this.rethrowSlug(error);
    }
    return id;
  }

  async update(venueId: string, patch: Partial<VenueProfileInput>, actor: Actor): Promise<void> {
    const venue = await this.find(venueId);
    const governorateId = patch.governorateId ?? venue.governorateId;
    await this.validateProfile(
      { ...patch, areaId: patch.areaId === undefined ? venue.areaId : patch.areaId },
      governorateId,
    );
    try {
      await this.db.transaction().execute(async (tx) => {
        await this.writeProfile(tx, venueId, patch);
        await this.audit.record(
          {
            actorType: actor.type,
            actorUserId: actor.userId,
            action: 'venue.updated',
            targetType: 'venue',
            targetId: venueId,
            organizationId: venue.organizationId,
            details: { fields: Object.keys(patch) },
            meta: actor.meta,
          },
          tx,
        );
      });
    } catch (error) {
      this.rethrowSlug(error);
    }
  }

  async setStatus(
    venueId: string,
    status: VenueStatus,
    reason: string,
    actor: Actor,
    hasActiveResource: (venueId: string) => Promise<boolean>,
  ): Promise<void> {
    await this.db.transaction().execute(async (tx) => {
      const current = await tx
        .selectFrom('venue.venues')
        .select(['status', 'organization_id'])
        .where('id', '=', venueId)
        .where('archived_at', 'is', null)
        .forUpdate()
        .executeTakeFirst();
      if (!current) throw Errors.notFound();
      if (!canTransition(current.status as VenueStatus, status)) {
        throw new AppError('INVALID_STATE_TRANSITION', 409, `${current.status} → ${status}`);
      }
      if (status === 'approved' && !(await hasActiveResource(venueId))) {
        throw new AppError(
          'INVALID_STATE_TRANSITION',
          409,
          'A venue needs at least one active resource to be approved',
        );
      }
      await tx
        .updateTable('venue.venues')
        .set({ status, status_reason: reason || null })
        .where('id', '=', venueId)
        .execute();
      await this.audit.record(
        {
          actorType: actor.type,
          actorUserId: actor.userId,
          action: `venue.status_changed`,
          targetType: 'venue',
          targetId: venueId,
          organizationId: current.organization_id,
          reason,
          details: { from: current.status, to: status },
          meta: actor.meta,
        },
        tx,
      );
    });
    // Approval/suspension changes which sports have an offering venue.
    this.catalog.invalidate();
  }

  async addFacility(venueId: string, name: Localized, actor: Actor): Promise<void> {
    const venue = await this.find(venueId);
    await this.db.transaction().execute(async (tx) => {
      const id = uuidv7();
      await tx
        .insertInto('venue.facilities')
        .values({ id, venue_id: venueId, name: JSON.stringify(name) })
        .execute();
      await this.audit.record(
        {
          actorType: actor.type,
          actorUserId: actor.userId,
          action: 'venue.facility_added',
          targetType: 'facility',
          targetId: id,
          organizationId: venue.organizationId,
          meta: actor.meta,
        },
        tx,
      );
    });
  }
}
