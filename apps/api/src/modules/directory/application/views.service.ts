import { Injectable } from '@nestjs/common';
import type {
  AdminVenue,
  Catalog,
  PublicResource,
  PublicVenue,
  VenueSummary,
} from '@jordan-sports/contracts';
import { CatalogService } from '../../catalog/index.js';
import { overlapping, ResourcesService, type ResourceRow } from '../../resources/index.js';
import { MediaService, VenuesService, type VenueRow } from '../../venues/index.js';

type Localized = { ar?: string; en?: string };

/**
 * Read-side composition of venues, resources, media and catalog into API views (the "search"
 * module of docs/architecture.md §E). Holds no state of its own.
 */
@Injectable()
export class VenueViewsService {
  constructor(
    private readonly catalog: CatalogService,
    private readonly venues: VenuesService,
    private readonly resources: ResourcesService,
    private readonly media: MediaService,
  ) {}

  private formatRefs(catalog: Catalog, formatIds: readonly string[]) {
    return catalog.sports.flatMap((s) =>
      s.formats
        .filter((f) => formatIds.includes(f.id))
        .map((f) => ({ id: f.id, key: f.key, name: f.name, sportKey: s.key, sportName: s.name })),
    );
  }

  async publicResource(catalog: Catalog, r: ResourceRow): Promise<PublicResource> {
    const type = catalog.resourceTypes.find((t) => t.id === r.resourceTypeId)!;
    return {
      id: r.id,
      name: r.name,
      type: { id: type.id, key: type.key, name: type.name },
      formats: this.formatRefs(catalog, r.sportFormatIds),
      features: await this.catalog.features(r.resourceTypeId, r.attributes),
      unitCount: r.unitIds.length,
    };
  }

  private sportsOf(catalog: Catalog, resources: readonly ResourceRow[]) {
    const formatIds = new Set(resources.flatMap((r) => r.sportFormatIds));
    return catalog.sports
      .filter((s) => s.formats.some((f) => formatIds.has(f.id)))
      .map((s) => ({ id: s.id, key: s.key, name: s.name }));
  }

  private place(catalog: Catalog, venue: VenueRow) {
    const city = catalog.cities.find((c) => c.id === venue.cityId)!;
    const area = city.areas.find((a) => a.id === venue.areaId) ?? null;
    return { city: { id: city.id, key: city.key, name: city.name }, area };
  }

  async summary(venue: VenueRow): Promise<VenueSummary> {
    const catalog = await this.catalog.get();
    const resources = (await this.resources.listForVenue(venue.id)).filter(
      (r) => r.status === 'active',
    );
    const media = await this.media.forVenue(venue.id);
    return {
      id: venue.id,
      slug: venue.slug,
      name: venue.name,
      ...this.place(catalog, venue),
      sports: this.sportsOf(catalog, resources),
      cover: media[0] ?? null,
    };
  }

  async publicVenue(venue: VenueRow): Promise<PublicVenue> {
    const catalog = await this.catalog.get();
    const resources = (await this.resources.listForVenue(venue.id)).filter(
      (r) => r.status === 'active',
    );
    const [media, amenityIds] = await Promise.all([
      this.media.forVenue(venue.id),
      this.venues.amenityIds(venue.id),
    ]);
    return {
      id: venue.id,
      slug: venue.slug,
      name: venue.name,
      description: venue.description,
      ...this.place(catalog, venue),
      address: venue.address,
      location: venue.location,
      contactPhone: venue.contactPhone,
      timezone: venue.timezone,
      currency: venue.currency,
      sports: this.sportsOf(catalog, resources),
      amenities: catalog.amenities.filter((a) => amenityIds.includes(a.id)),
      media,
      cover: media[0] ?? null,
      resources: await Promise.all(resources.map((r) => this.publicResource(catalog, r))),
    };
  }

  async adminVenue(venueId: string): Promise<AdminVenue> {
    const venue = await this.venues.find(venueId);
    const catalog = await this.catalog.get();
    const [resources, facilities, media, amenityIds] = await Promise.all([
      this.resources.listForVenue(venueId),
      this.venues.facilities(venueId),
      this.media.forVenue(venueId),
      this.venues.amenityIds(venueId),
    ]);
    return {
      id: venue.id,
      organizationId: venue.organizationId,
      slug: venue.slug,
      name: venue.name,
      description: venue.description,
      status: venue.status,
      timezone: venue.timezone,
      currency: venue.currency,
      cityId: venue.cityId,
      areaId: venue.areaId,
      address: venue.address,
      location: venue.location,
      contactPhone: venue.contactPhone,
      businessDayStartMinute: venue.businessDayStartMinute,
      amenityIds,
      facilities: facilities as Array<{ id: string; name: Localized }>,
      media,
      createdAt: venue.createdAt.toISOString(),
      resources: await Promise.all(
        resources.map(async (r) => ({
          ...(await this.publicResource(catalog, r)),
          status: r.status,
          facilityId: r.facilityId,
          resourceTypeId: r.resourceTypeId,
          sportFormatIds: r.sportFormatIds,
          attributes: r.attributes,
          unitIds: r.unitIds,
          overlapsWith: overlapping(r, resources),
        })),
      ),
    };
  }
}
