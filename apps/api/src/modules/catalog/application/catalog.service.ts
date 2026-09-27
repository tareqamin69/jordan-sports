import { Inject, Injectable } from '@nestjs/common';
import { attributeFieldSchema, type AttributeField, type Catalog } from '@jordan-sports/contracts';
import { sql } from 'kysely';
import { z } from 'zod';
import type { Db } from '../../../platform/database/database.js';
import { DATABASE } from '../../../platform/database/database.module.js';
import { uuidv7 } from '../../../platform/database/ids.js';
import { AppError, Errors } from '../../../platform/http/errors.js';
import {
  describeAttributes,
  validateAttributes,
  type AttributeValues,
  type Feature,
} from '../domain/attributes.js';

type Localized = { ar?: string; en?: string };
const fieldsSchema = z.object({ fields: z.array(attributeFieldSchema) });
const CACHE_MS = 60_000;
const KEY_PATTERN = /^[a-z0-9_]+$/;

@Injectable()
export class CatalogService {
  private cached?: { at: number; value: Catalog };

  constructor(@Inject(DATABASE) private readonly db: Db) {}

  /** Reference data changes rarely; cached briefly in memory. */
  async get(): Promise<Catalog> {
    if (this.cached && Date.now() - this.cached.at < CACHE_MS) return this.cached.value;
    const [sports, formats, types, typeFormats, amenities, governorates, areas, offered] =
      await Promise.all([
        this.db
          .selectFrom('catalog.sports')
          .selectAll()
          .where('active', '=', true)
          .orderBy('sort_order')
          .execute(),
        this.db
          .selectFrom('catalog.sport_formats')
          .selectAll()
          .where('active', '=', true)
          .orderBy('sort_order')
          .execute(),
        this.db
          .selectFrom('catalog.resource_types')
          .selectAll()
          .where('active', '=', true)
          .orderBy('sort_order')
          .execute(),
        this.db.selectFrom('catalog.resource_type_formats').selectAll().execute(),
        this.db.selectFrom('catalog.amenities').selectAll().orderBy('sort_order').execute(),
        this.db.selectFrom('catalog.cities').selectAll().orderBy('sort_order').execute(),
        // Areas are shown alphabetically by Arabic name (governorates and everything else keep
        // sort_order — only areas need this because the list per governorate is long).
        this.db
          .selectFrom('catalog.areas')
          .selectAll()
          .orderBy(sql`name->>'ar'`)
          .execute(),
        this.db
          .selectFrom('catalog.sport_formats as sf')
          .innerJoin('resource.resource_formats as rf', 'rf.sport_format_id', 'sf.id')
          .innerJoin('resource.resources as r', (join) =>
            join.onRef('r.id', '=', 'rf.resource_id').on('r.status', '=', 'active'),
          )
          .innerJoin('venue.venues as v', (join) =>
            join
              .onRef('v.id', '=', 'r.venue_id')
              .on('v.status', '=', 'approved')
              .on('v.archived_at', 'is', null),
          )
          .select('sf.sport_id')
          .distinct()
          .execute(),
      ]);
    const value: Catalog = {
      sports: sports.map((s) => ({
        id: s.id,
        key: s.key,
        name: s.name as Localized,
        icon: s.icon,
        formats: formats
          .filter((f) => f.sport_id === s.id)
          .map((f) => ({
            id: f.id,
            key: f.key,
            name: f.name as Localized,
            minPlayers: f.min_players,
            maxPlayers: f.max_players,
            defaultDurationMinutes: f.default_duration_minutes,
          })),
      })),
      resourceTypes: types.map((t) => ({
        id: t.id,
        key: t.key,
        name: t.name as Localized,
        attributes: fieldsSchema.parse(t.attribute_schema).fields,
        sportFormatIds: typeFormats
          .filter((tf) => tf.resource_type_id === t.id)
          .map((tf) => tf.sport_format_id),
      })),
      amenities: amenities.map((a) => ({ id: a.id, key: a.key, name: a.name as Localized })),
      governorates: governorates.map((g) => ({
        id: g.id,
        key: g.key,
        name: g.name as Localized,
        timezone: g.timezone,
        areas: areas
          .filter((a) => a.city_id === g.id)
          .map((a) => ({ id: a.id, key: a.key, name: a.name as Localized })),
      })),
      offeredSportIds: [...new Set(offered.map((o) => o.sport_id))],
    };
    this.cached = { at: Date.now(), value };
    return value;
  }

  /**
   * Drops the cache. Called after any catalog write, and also when a venue's or resource's status
   * changes — `offeredSportIds` depends on those, and letting it go stale for up to CACHE_MS would
   * hide a just-approved venue's sport from players for up to a minute.
   */
  invalidate(): void {
    this.cached = undefined;
  }

  async resourceType(id: string) {
    const type = (await this.get()).resourceTypes.find((t) => t.id === id);
    if (!type) throw new AppError('VALIDATION_FAILED', 400, 'Unknown resource type');
    return type;
  }

  /** Throws unless every format is compatible with the resource type. */
  async assertFormats(resourceTypeId: string, sportFormatIds: readonly string[]): Promise<void> {
    const type = await this.resourceType(resourceTypeId);
    if (
      sportFormatIds.length === 0 ||
      !sportFormatIds.every((id) => type.sportFormatIds.includes(id))
    ) {
      throw new AppError(
        'VALIDATION_FAILED',
        400,
        'Sport formats are not compatible with the resource type',
      );
    }
  }

  async validateAttributes(
    resourceTypeId: string,
    attributes: AttributeValues,
  ): Promise<AttributeValues> {
    const type = await this.resourceType(resourceTypeId);
    const result = validateAttributes(type.attributes, attributes);
    if (typeof result === 'string') throw new AppError('INVALID_ATTRIBUTES', 400, result);
    return result;
  }

  async features(resourceTypeId: string, attributes: AttributeValues): Promise<Feature[]> {
    const type = (await this.get()).resourceTypes.find((t) => t.id === resourceTypeId);
    return type ? describeAttributes(type.attributes as AttributeField[], attributes) : [];
  }

  async defaultDurations(sportFormatIds: readonly string[]): Promise<number[]> {
    const formats = (await this.get()).sports.flatMap((s) => s.formats);
    const durations = formats
      .filter((f) => sportFormatIds.includes(f.id))
      .map((f) => f.defaultDurationMinutes);
    return [...new Set(durations.length ? durations : [60])].sort((a, b) => a - b);
  }

  async governorate(id: string) {
    const governorate = (await this.get()).governorates.find((g) => g.id === id);
    if (!governorate) throw new AppError('VALIDATION_FAILED', 400, 'Unknown governorate');
    return governorate;
  }

  async assertArea(governorateId: string, areaId: string | null | undefined): Promise<void> {
    if (!areaId) return;
    const governorate = await this.governorate(governorateId);
    if (!governorate.areas.some((a) => a.id === areaId))
      throw new AppError('VALIDATION_FAILED', 400, 'Unknown area');
  }

  async assertAmenities(ids: readonly string[]): Promise<void> {
    const known = new Set((await this.get()).amenities.map((a) => a.id));
    if (!ids.every((id) => known.has(id)))
      throw new AppError('VALIDATION_FAILED', 400, 'Unknown amenity');
  }

  // -----------------------------------------------------------------------------------------
  // Admin geography management (docs/plans/jordan-wide-cliq-marketplace.md §1): create, rename
  // and reorder only — never delete, so a venue referencing a governorate/area is never orphaned.
  // -----------------------------------------------------------------------------------------

  async createGovernorate(input: { key: string; name: Localized }): Promise<Catalog> {
    if (!KEY_PATTERN.test(input.key)) throw new AppError('VALIDATION_FAILED', 400, 'Invalid key');
    const maxOrder = await this.db
      .selectFrom('catalog.cities')
      .select((eb) => eb.fn.max('sort_order').as('max'))
      .executeTakeFirst();
    try {
      await this.db
        .insertInto('catalog.cities')
        .values({
          id: uuidv7(),
          key: input.key,
          country_code: 'JO',
          name: JSON.stringify(input.name),
          timezone: 'Asia/Amman',
          sort_order: (maxOrder?.max ?? 0) + 1,
        })
        .execute();
    } catch {
      throw new AppError('VALIDATION_FAILED', 400, 'A governorate with this key already exists');
    }
    this.invalidate();
    return this.get();
  }

  async updateGovernorate(
    governorateId: string,
    patch: { name?: Localized; sortOrder?: number },
  ): Promise<Catalog> {
    await this.governorate(governorateId);
    const updated = await this.db
      .updateTable('catalog.cities')
      .set({
        ...(patch.name !== undefined ? { name: JSON.stringify(patch.name) } : {}),
        ...(patch.sortOrder !== undefined ? { sort_order: patch.sortOrder } : {}),
      })
      .where('id', '=', governorateId)
      .executeTakeFirst();
    if (Number(updated.numUpdatedRows) !== 1) throw Errors.notFound();
    this.invalidate();
    return this.get();
  }

  async createArea(
    governorateId: string,
    input: { key: string; name: Localized },
  ): Promise<Catalog> {
    if (!KEY_PATTERN.test(input.key)) throw new AppError('VALIDATION_FAILED', 400, 'Invalid key');
    await this.governorate(governorateId);
    const maxOrder = await this.db
      .selectFrom('catalog.areas')
      .select((eb) => eb.fn.max('sort_order').as('max'))
      .where('city_id', '=', governorateId)
      .executeTakeFirst();
    try {
      await this.db
        .insertInto('catalog.areas')
        .values({
          id: uuidv7(),
          city_id: governorateId,
          key: input.key,
          name: JSON.stringify(input.name),
          sort_order: (maxOrder?.max ?? 0) + 1,
        })
        .execute();
    } catch {
      throw new AppError('VALIDATION_FAILED', 400, 'An area with this key already exists here');
    }
    this.invalidate();
    return this.get();
  }

  async updateArea(
    areaId: string,
    patch: { name?: Localized; sortOrder?: number },
  ): Promise<Catalog> {
    const updated = await this.db
      .updateTable('catalog.areas')
      .set({
        ...(patch.name !== undefined ? { name: JSON.stringify(patch.name) } : {}),
        ...(patch.sortOrder !== undefined ? { sort_order: patch.sortOrder } : {}),
      })
      .where('id', '=', areaId)
      .executeTakeFirst();
    if (Number(updated.numUpdatedRows) !== 1) throw Errors.notFound();
    this.invalidate();
    return this.get();
  }

  // -----------------------------------------------------------------------------------------
  // Admin sports management: a sport is created with exactly one format and one resource type
  // (matching how the initial catalog was seeded); the database can be extended directly with
  // more formats/resource types for a sport as the catalog grows.
  // -----------------------------------------------------------------------------------------

  async createSport(input: {
    key: string;
    name: Localized;
    icon: string;
    format: {
      key: string;
      name: Localized;
      minPlayers: number;
      maxPlayers: number;
      defaultDurationMinutes: number;
    };
    resourceType: { key: string; name: Localized };
  }): Promise<Catalog> {
    if (
      !KEY_PATTERN.test(input.key) ||
      !KEY_PATTERN.test(input.format.key) ||
      !KEY_PATTERN.test(input.resourceType.key)
    ) {
      throw new AppError('VALIDATION_FAILED', 400, 'Invalid key');
    }
    if (input.format.minPlayers > input.format.maxPlayers) {
      throw new AppError('VALIDATION_FAILED', 400, 'minPlayers must not exceed maxPlayers');
    }
    try {
      await this.db.transaction().execute(async (tx) => {
        const maxSportOrder = await tx
          .selectFrom('catalog.sports')
          .select((eb) => eb.fn.max('sort_order').as('max'))
          .executeTakeFirst();
        const sportId = uuidv7();
        await tx
          .insertInto('catalog.sports')
          .values({
            id: sportId,
            key: input.key,
            name: JSON.stringify(input.name),
            icon: input.icon,
            sort_order: (maxSportOrder?.max ?? 0) + 1,
          })
          .execute();
        const formatId = uuidv7();
        await tx
          .insertInto('catalog.sport_formats')
          .values({
            id: formatId,
            sport_id: sportId,
            key: input.format.key,
            name: JSON.stringify(input.format.name),
            min_players: input.format.minPlayers,
            max_players: input.format.maxPlayers,
            default_duration_minutes: input.format.defaultDurationMinutes,
            sort_order: 1,
          })
          .execute();
        const maxTypeOrder = await tx
          .selectFrom('catalog.resource_types')
          .select((eb) => eb.fn.max('sort_order').as('max'))
          .executeTakeFirst();
        const resourceTypeId = uuidv7();
        await tx
          .insertInto('catalog.resource_types')
          .values({
            id: resourceTypeId,
            key: input.resourceType.key,
            name: JSON.stringify(input.resourceType.name),
            sort_order: (maxTypeOrder?.max ?? 0) + 1,
          })
          .execute();
        await tx
          .insertInto('catalog.resource_type_formats')
          .values({ resource_type_id: resourceTypeId, sport_format_id: formatId })
          .execute();
      });
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(
        'VALIDATION_FAILED',
        400,
        'A sport, format or resource type key already exists',
      );
    }
    this.invalidate();
    return this.get();
  }

  async updateSport(sportId: string, patch: { name?: Localized; icon?: string }): Promise<Catalog> {
    const updated = await this.db
      .updateTable('catalog.sports')
      .set({
        ...(patch.name !== undefined ? { name: JSON.stringify(patch.name) } : {}),
        ...(patch.icon !== undefined ? { icon: patch.icon } : {}),
      })
      .where('id', '=', sportId)
      .executeTakeFirst();
    if (Number(updated.numUpdatedRows) !== 1) throw Errors.notFound();
    this.invalidate();
    return this.get();
  }
}
