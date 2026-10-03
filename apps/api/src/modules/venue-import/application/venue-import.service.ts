import { Inject, Injectable } from '@nestjs/common';
import { governorateForPoint, geoDistanceKm, type VenueImport } from '@jordan-sports/contracts';
import { sql } from 'kysely';
import type { Db } from '../../../platform/database/database.js';
import { DATABASE } from '../../../platform/database/database.module.js';
import { bypassTenant } from '../../../platform/database/tenant.js';
import { transaction } from '../../../platform/database/transaction.js';
import { AppError } from '../../../platform/http/errors.js';
import { RateLimiter } from '../../../platform/redis/rate-limiter.js';
import { CatalogService } from '../../catalog/index.js';
import { normalizePhone } from '../../identity/index.js';
import { parseMapUrl } from '../domain/map-link.js';
import { resolveMapLink, type HopFetcher } from './link-resolver.js';
import { PlacesClient } from './places-client.js';

export const LINK_FETCHER = Symbol('LINK_FETCHER');

/** Per person: generous for real use, useless for scraping through us. */
const IMPORT_LIMIT = { name: 'venue-import', limit: 20, windowSeconds: 3600 } as const;
/** An area is suggested only when a known venue in it is this close (km). */
const AREA_RADIUS_KM = 5;

/**
 * "Paste your Google Maps link": name, pin, governorate and nearest area from the link alone
 * (free), plus phone, website, address and opening hours when the optional Places key is set.
 * Nothing is saved here: the result pre-fills the form and the owner reviews it.
 */
@Injectable()
export class VenueImportService {
  constructor(
    @Inject(DATABASE) private readonly db: Db,
    private readonly catalog: CatalogService,
    private readonly rateLimiter: RateLimiter,
    private readonly places: PlacesClient,
    @Inject(LINK_FETCHER) private readonly fetchHop: HopFetcher | undefined,
  ) {}

  async import(url: string, subject: string): Promise<VenueImport> {
    await this.rateLimiter.enforce([[IMPORT_LIMIT, subject]]);
    const final = await resolveMapLink(url, this.fetchHop);
    if (!final) throw new AppError('MAP_LINK_UNREADABLE', 422);
    const parsed = parseMapUrl(final);
    if (!parsed.name && !parsed.location) throw new AppError('MAP_LINK_UNREADABLE', 422);

    const place = parsed.name ? await this.places.lookup(parsed.name, parsed.location) : null;
    const location = parsed.location ?? place?.location ?? null;
    const { governorateId, areaId } = location
      ? await this.placeOf(location)
      : { governorateId: null, areaId: null };
    return {
      source: place ? 'places' : 'link',
      name: parsed.name ?? place?.name ?? null,
      location,
      governorateId,
      areaId,
      placeId: place?.placeId ?? null,
      phone: place?.phone ? normalizePhone(place.phone) : null,
      website: place?.website ?? null,
      address: place?.address ?? null,
      weeklyHours: place?.weeklyHours ?? null,
    };
  }

  /**
   * Governorate from our own centres (packages/contracts/src/geo.ts); area from where venues
   * already on the map sit in it (the average of their pins), if one is within AREA_RADIUS_KM.
   */
  private async placeOf(point: { lat: number; lng: number }) {
    const key = governorateForPoint(point);
    const governorate = key
      ? (await this.catalog.get()).governorates.find((g) => g.key === key)
      : undefined;
    if (!governorate) return { governorateId: null, areaId: null };
    const centroids = await transaction(this.db, async (tx) => {
      await bypassTenant(tx);
      return tx
        .selectFrom('venue.venues')
        .select([
          'area_id',
          sql<number>`avg(ST_Y(location::geometry))`.as('lat'),
          sql<number>`avg(ST_X(location::geometry))`.as('lng'),
        ])
        .where('city_id', '=', governorate.id)
        .where('area_id', 'is not', null)
        .where('location', 'is not', null)
        .groupBy('area_id')
        .execute();
    });
    let best: { id: string; km: number } | null = null;
    for (const c of centroids) {
      const km = geoDistanceKm(point, { lat: Number(c.lat), lng: Number(c.lng) });
      if (km <= AREA_RADIUS_KM && (!best || km < best.km)) best = { id: c.area_id!, km };
    }
    return { governorateId: governorate.id, areaId: best?.id ?? null };
  }
}
