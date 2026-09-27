import { Inject, Injectable } from '@nestjs/common';
import type { PublicVenue, VenueSummary } from '@jordan-sports/contracts';
import type { Db } from '../../../platform/database/database.js';
import { DATABASE } from '../../../platform/database/database.module.js';
import { Errors } from '../../../platform/http/errors.js';
import { VenuesService } from '../../venues/index.js';
import { VenueViewsService } from './views.service.js';

/** Public marketplace queries. Only approved, non-archived venues are ever returned. */
@Injectable()
export class DirectoryService {
  constructor(
    @Inject(DATABASE) private readonly db: Db,
    private readonly venues: VenuesService,
    private readonly views: VenueViewsService,
  ) {}

  async list(filters: {
    sport?: string;
    city?: string;
    area?: string;
    cursor?: string;
    limit: number;
  }): Promise<{ items: VenueSummary[]; nextCursor: string | null }> {
    let query = this.db
      .selectFrom('venue.venues as v')
      .innerJoin('catalog.cities as c', 'c.id', 'v.city_id')
      .leftJoin('catalog.areas as a', 'a.id', 'v.area_id')
      .select('v.id')
      .where('v.status', '=', 'approved')
      .where('v.archived_at', 'is', null)
      .orderBy('v.id', 'desc')
      .limit(filters.limit + 1);
    if (filters.cursor) query = query.where('v.id', '<', filters.cursor);
    if (filters.city) query = query.where('c.key', '=', filters.city);
    if (filters.area) query = query.where('a.key', '=', filters.area);
    if (filters.sport) {
      const sport = filters.sport;
      query = query.where((eb) =>
        eb.exists(
          eb
            .selectFrom('resource.resources as r')
            .innerJoin('resource.resource_formats as rf', 'rf.resource_id', 'r.id')
            .innerJoin('catalog.sport_formats as f', 'f.id', 'rf.sport_format_id')
            .innerJoin('catalog.sports as s', 's.id', 'f.sport_id')
            .select('r.id')
            .whereRef('r.venue_id', '=', 'v.id')
            .where('r.status', '=', 'active')
            .where('s.key', '=', sport),
        ),
      );
    }
    const rows = await query.execute();
    const page = rows.slice(0, filters.limit);
    const items = await Promise.all(
      page.map(async (r) => this.views.summary(await this.venues.find(r.id))),
    );
    return { items, nextCursor: rows.length > filters.limit ? page.at(-1)!.id : null };
  }

  async get(slug: string): Promise<PublicVenue> {
    const venue = await this.venues.findBySlug(slug);
    if (!venue || venue.status !== 'approved') throw Errors.notFound();
    return this.views.publicVenue(venue);
  }
}
