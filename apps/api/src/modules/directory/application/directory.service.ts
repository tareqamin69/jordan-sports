import { Inject, Injectable } from '@nestjs/common';
import type { PublicVenue, VenueSummary } from '@jordan-sports/contracts';
import type { Db } from '../../../platform/database/database.js';
import { DATABASE } from '../../../platform/database/database.module.js';
import { Errors } from '../../../platform/http/errors.js';
import { takesOnlineBookings, takesOnlineBookingsFilter } from '../../finance/index.js';
import { VenuesService } from '../../venues/index.js';
import { AvailabilityViewService } from './availability-view.service.js';
import { VenueViewsService } from './views.service.js';
import { SettingsService } from '../../settings/index.js';

const SEARCH_CANDIDATES = 50;
const FREE_TIMES_SHOWN = 4;
/** A searched time matches free starts from one hour before to two hours after it. */
const TIME_WINDOW = { before: 60, after: 120 };

function minutesOf(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/**
 * Public marketplace queries. Only approved, non-archived venues that can take online bookings
 * (commission balance above zero, no overdue refund) are ever returned.
 */
@Injectable()
export class DirectoryService {
  constructor(
    @Inject(DATABASE) private readonly db: Db,
    private readonly settings: SettingsService,
    private readonly venues: VenuesService,
    private readonly views: VenueViewsService,
    private readonly availability: AvailabilityViewService,
  ) {}

  async list(filters: {
    sport?: string;
    governorate?: string;
    area?: string;
    date?: string;
    time?: string;
    cursor?: string;
    limit: number;
  }): Promise<{ items: VenueSummary[]; nextCursor: string | null }> {
    if (filters.date) return this.search({ ...filters, date: filters.date });
    let query = this.db
      .selectFrom('venue.venues as v')
      .innerJoin('catalog.cities as g', 'g.id', 'v.city_id')
      .leftJoin('catalog.areas as a', 'a.id', 'v.area_id')
      .select('v.id')
      .where('v.status', '=', 'approved')
      .where('v.archived_at', 'is', null)
      .where(takesOnlineBookingsFilter(await this.settings.cliqPayments()))
      .orderBy('v.id', 'desc')
      .limit(filters.limit + 1);
    if (filters.cursor) query = query.where('v.id', '<', filters.cursor);
    if (filters.governorate) query = query.where('g.key', '=', filters.governorate);
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

  /**
   * Venues with a free, priced start on `date` (optionally near `time`). Pilot scale: checks up to
   * SEARCH_CANDIDATES venues matching the other filters and returns them without paging.
   */
  private async search(filters: {
    sport?: string;
    governorate?: string;
    area?: string;
    date: string;
    time?: string;
    limit: number;
  }): Promise<{ items: VenueSummary[]; nextCursor: null }> {
    const { date, time, ...rest } = filters;
    const candidates = await this.list({ ...rest, limit: SEARCH_CANDIDATES });
    const target = time ? minutesOf(time) : null;
    const results = await Promise.all(
      candidates.items.map(async (venue) => {
        let availability;
        try {
          availability = await this.availability.forVenue(venue.slug, date);
        } catch {
          return null; // e.g. a date outside the venue's booking window
        }
        const seen = new Set<string>();
        const free = availability.resources
          .flatMap((r) => r.slots)
          .filter((s) => s.available)
          .filter((s) => {
            if (target === null) return true;
            const delta = minutesOf(s.localStart) - target;
            return delta >= -TIME_WINDOW.before && delta <= TIME_WINDOW.after;
          })
          .sort(
            (a, b) =>
              (target === null
                ? 0
                : Math.abs(minutesOf(a.localStart) - target) -
                  Math.abs(minutesOf(b.localStart) - target)) ||
              a.start.localeCompare(b.start) ||
              a.durationMinutes - b.durationMinutes,
          )
          .filter((s) => (seen.has(s.start) ? false : (seen.add(s.start), true)))
          .slice(0, FREE_TIMES_SHOWN)
          .sort((a, b) => a.start.localeCompare(b.start))
          .map((s) => ({
            start: s.start,
            localStart: s.localStart,
            durationMinutes: s.durationMinutes,
            price: s.price,
          }));
        return free.length > 0 ? { ...venue, freeTimes: free } : null;
      }),
    );
    return {
      items: results.filter((v): v is NonNullable<typeof v> => v !== null).slice(0, filters.limit),
      nextCursor: null,
    };
  }

  async get(slug: string): Promise<PublicVenue> {
    const venue = await this.venues.findBySlug(slug);
    if (!venue || venue.status !== 'approved') throw Errors.notFound();
    if (!(await takesOnlineBookings(this.db, venue, await this.settings.cliqPayments())))
      throw Errors.notFound();
    return this.views.publicVenue(venue);
  }
}
