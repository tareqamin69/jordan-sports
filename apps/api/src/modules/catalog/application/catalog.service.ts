import { Inject, Injectable } from '@nestjs/common';
import { attributeFieldSchema, type AttributeField, type Catalog } from '@jordan-sports/contracts';
import { z } from 'zod';
import type { Db } from '../../../platform/database/database.js';
import { DATABASE } from '../../../platform/database/database.module.js';
import { AppError } from '../../../platform/http/errors.js';
import {
  describeAttributes,
  validateAttributes,
  type AttributeValues,
  type Feature,
} from '../domain/attributes.js';

type Localized = { ar?: string; en?: string };
const fieldsSchema = z.object({ fields: z.array(attributeFieldSchema) });
const CACHE_MS = 60_000;

@Injectable()
export class CatalogService {
  private cached?: { at: number; value: Catalog };

  constructor(@Inject(DATABASE) private readonly db: Db) {}

  /** Reference data changes rarely; cached briefly in memory. */
  async get(): Promise<Catalog> {
    if (this.cached && Date.now() - this.cached.at < CACHE_MS) return this.cached.value;
    const [sports, formats, types, typeFormats, amenities, cities, areas] = await Promise.all([
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
      this.db.selectFrom('catalog.areas').selectAll().orderBy('sort_order').execute(),
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
      cities: cities.map((c) => ({
        id: c.id,
        key: c.key,
        name: c.name as Localized,
        timezone: c.timezone,
        areas: areas
          .filter((a) => a.city_id === c.id)
          .map((a) => ({ id: a.id, key: a.key, name: a.name as Localized })),
      })),
    };
    this.cached = { at: Date.now(), value };
    return value;
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

  async city(id: string) {
    const city = (await this.get()).cities.find((c) => c.id === id);
    if (!city) throw new AppError('VALIDATION_FAILED', 400, 'Unknown city');
    return city;
  }

  async assertArea(cityId: string, areaId: string | null | undefined): Promise<void> {
    if (!areaId) return;
    const city = await this.city(cityId);
    if (!city.areas.some((a) => a.id === areaId))
      throw new AppError('VALIDATION_FAILED', 400, 'Unknown area');
  }

  async assertAmenities(ids: readonly string[]): Promise<void> {
    const known = new Set((await this.get()).amenities.map((a) => a.id));
    if (!ids.every((id) => known.has(id)))
      throw new AppError('VALIDATION_FAILED', 400, 'Unknown amenity');
  }
}
