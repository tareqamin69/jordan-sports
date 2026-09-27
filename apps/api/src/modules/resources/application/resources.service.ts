import { Inject, Injectable } from '@nestjs/common';
import type { Db, DbOrTx } from '../../../platform/database/database.js';
import { DATABASE } from '../../../platform/database/database.module.js';
import { uuidv7 } from '../../../platform/database/ids.js';
import { AppError, Errors } from '../../../platform/http/errors.js';
import { AuditService } from '../../audit/index.js';
import { CatalogService, type AttributeValues } from '../../catalog/index.js';
import type { Actor } from '../../venues/index.js';

type Localized = { ar?: string; en?: string };
export type ResourceStatus = 'active' | 'inactive' | 'archived';

export interface ResourceRow {
  id: string;
  venueId: string;
  facilityId: string | null;
  resourceTypeId: string;
  name: Localized;
  attributes: AttributeValues;
  status: ResourceStatus;
  unitIds: string[];
  sportFormatIds: string[];
}

export interface CreateResourceInput {
  name: Localized;
  resourceTypeId: string;
  facilityId?: string | null;
  sportFormatIds: string[];
  attributes: AttributeValues;
  combinesResourceIds?: string[];
}

export interface UpdateResourceInput {
  name?: Localized;
  facilityId?: string | null;
  sportFormatIds?: string[];
  attributes?: AttributeValues;
  status?: ResourceStatus;
}

@Injectable()
export class ResourcesService {
  constructor(
    @Inject(DATABASE) private readonly db: Db,
    private readonly catalog: CatalogService,
    private readonly audit: AuditService,
  ) {}

  /** Resources of a venue (archived excluded unless requested), with units and formats. */
  async listForVenue(
    venueId: string,
    options: { includeArchived?: boolean } = {},
    db: DbOrTx = this.db,
  ): Promise<ResourceRow[]> {
    let query = db
      .selectFrom('resource.resources')
      .select(['id', 'venue_id', 'facility_id', 'resource_type_id', 'name', 'attributes', 'status'])
      .where('venue_id', '=', venueId)
      .orderBy('sort_order')
      .orderBy('created_at');
    if (!options.includeArchived) query = query.where('status', '<>', 'archived');
    const rows = await query.execute();
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    const [units, formats] = await Promise.all([
      db
        .selectFrom('resource.resource_units')
        .select(['resource_id', 'unit_id'])
        .where('resource_id', 'in', ids)
        .execute(),
      db
        .selectFrom('resource.resource_formats')
        .select(['resource_id', 'sport_format_id'])
        .where('resource_id', 'in', ids)
        .execute(),
    ]);
    return rows.map((r) => ({
      id: r.id,
      venueId: r.venue_id,
      facilityId: r.facility_id,
      resourceTypeId: r.resource_type_id,
      name: r.name as Localized,
      attributes: r.attributes as AttributeValues,
      status: r.status as ResourceStatus,
      unitIds: units.filter((u) => u.resource_id === r.id).map((u) => u.unit_id),
      sportFormatIds: formats.filter((f) => f.resource_id === r.id).map((f) => f.sport_format_id),
    }));
  }

  async find(resourceId: string, db: DbOrTx = this.db): Promise<ResourceRow> {
    const row = await db
      .selectFrom('resource.resources')
      .select('venue_id')
      .where('id', '=', resourceId)
      .executeTakeFirst();
    if (!row) throw Errors.notFound();
    const resource = (await this.listForVenue(row.venue_id, { includeArchived: true }, db)).find(
      (r) => r.id === resourceId,
    );
    if (!resource) throw Errors.notFound();
    return resource;
  }

  async hasActiveResource(venueId: string): Promise<boolean> {
    const row = await this.db
      .selectFrom('resource.resources')
      .select('id')
      .where('venue_id', '=', venueId)
      .where('status', '=', 'active')
      .limit(1)
      .executeTakeFirst();
    return row !== undefined;
  }

  private async assertFacility(venueId: string, facilityId: string | null | undefined, db: DbOrTx) {
    if (!facilityId) return;
    const f = await db
      .selectFrom('venue.facilities')
      .select('id')
      .where('id', '=', facilityId)
      .where('venue_id', '=', venueId)
      .where('archived_at', 'is', null)
      .executeTakeFirst();
    if (!f) throw new AppError('VALIDATION_FAILED', 400, 'Unknown facility');
  }

  async create(
    venueId: string,
    organizationId: string,
    input: CreateResourceInput,
    actor: Actor,
  ): Promise<string> {
    await this.catalog.assertFormats(input.resourceTypeId, input.sportFormatIds);
    const attributes = await this.catalog.validateAttributes(
      input.resourceTypeId,
      input.attributes,
    );
    const durations = await this.catalog.defaultDurations(input.sportFormatIds);

    return this.db.transaction().execute(async (tx) => {
      await this.assertFacility(venueId, input.facilityId, tx);
      const id = uuidv7();

      // Units: a new unit of its own, or the union of the combined resources' units (ADR-0004).
      let unitIds: string[];
      if (input.combinesResourceIds && input.combinesResourceIds.length > 0) {
        const parts = await tx
          .selectFrom('resource.resources as r')
          .innerJoin('resource.resource_units as ru', 'ru.resource_id', 'r.id')
          .select(['r.id', 'ru.unit_id'])
          .where('r.id', 'in', input.combinesResourceIds)
          .where('r.venue_id', '=', venueId)
          .where('r.status', '<>', 'archived')
          .execute();
        const found = new Set(parts.map((p) => p.id));
        if (
          input.combinesResourceIds.some((rid) => !found.has(rid)) ||
          input.combinesResourceIds.length < 2
        ) {
          throw new AppError(
            'VALIDATION_FAILED',
            400,
            'A combined resource needs at least two resources of this venue',
          );
        }
        unitIds = [...new Set(parts.map((p) => p.unit_id))];
      } else {
        const unitId = uuidv7();
        await tx.insertInto('resource.units').values({ id: unitId, venue_id: venueId }).execute();
        unitIds = [unitId];
      }

      const order = await tx
        .selectFrom('resource.resources')
        .select((eb) => eb.fn.countAll<string>().as('n'))
        .where('venue_id', '=', venueId)
        .executeTakeFirstOrThrow();
      await tx
        .insertInto('resource.resources')
        .values({
          id,
          venue_id: venueId,
          facility_id: input.facilityId ?? null,
          resource_type_id: input.resourceTypeId,
          name: JSON.stringify(input.name),
          attributes: JSON.stringify(attributes),
          sort_order: Number(order.n),
        })
        .execute();
      await tx
        .insertInto('resource.resource_units')
        .values(unitIds.map((unit_id) => ({ resource_id: id, unit_id })))
        .execute();
      await tx
        .insertInto('resource.resource_formats')
        .values(
          [...new Set(input.sportFormatIds)].map((sport_format_id) => ({
            resource_id: id,
            sport_format_id,
          })),
        )
        .execute();
      await tx
        .insertInto('resource.booking_policies')
        .values({ resource_id: id, slot_durations: durations })
        .execute();
      await this.audit.record(
        {
          actorType: actor.type,
          actorUserId: actor.userId,
          action: 'resource.created',
          targetType: 'resource',
          targetId: id,
          organizationId,
          details: { venueId, units: unitIds.length },
          meta: actor.meta,
        },
        tx,
      );
      return id;
    });
  }

  async update(
    resourceId: string,
    organizationId: string,
    input: UpdateResourceInput,
    actor: Actor,
  ): Promise<string> {
    const current = await this.find(resourceId);
    if (input.sportFormatIds)
      await this.catalog.assertFormats(current.resourceTypeId, input.sportFormatIds);
    const attributes = input.attributes
      ? await this.catalog.validateAttributes(current.resourceTypeId, input.attributes)
      : undefined;

    await this.db.transaction().execute(async (tx) => {
      await this.assertFacility(current.venueId, input.facilityId, tx);
      const values: Record<string, unknown> = {};
      if (input.name) values.name = JSON.stringify(input.name);
      if (input.facilityId !== undefined) values.facility_id = input.facilityId;
      if (attributes) values.attributes = JSON.stringify(attributes);
      if (input.status) values.status = input.status;
      if (Object.keys(values).length > 0) {
        await tx
          .updateTable('resource.resources')
          .set(values)
          .where('id', '=', resourceId)
          .execute();
      }
      if (input.sportFormatIds) {
        await tx
          .deleteFrom('resource.resource_formats')
          .where('resource_id', '=', resourceId)
          .execute();
        await tx
          .insertInto('resource.resource_formats')
          .values(
            [...new Set(input.sportFormatIds)].map((sport_format_id) => ({
              resource_id: resourceId,
              sport_format_id,
            })),
          )
          .execute();
      }
      await this.audit.record(
        {
          actorType: actor.type,
          actorUserId: actor.userId,
          action: 'resource.updated',
          targetType: 'resource',
          targetId: resourceId,
          organizationId,
          details: { fields: Object.keys(input) },
          meta: actor.meta,
        },
        tx,
      );
    });
    return current.venueId;
  }
}

/** Resources that share at least one unit with `resource` (they can never be booked together). */
export function overlapping(resource: ResourceRow, all: readonly ResourceRow[]): string[] {
  const units = new Set(resource.unitIds);
  return all
    .filter((r) => r.id !== resource.id && r.unitIds.some((u) => units.has(u)))
    .map((r) => r.id);
}
