import { Inject, Injectable } from '@nestjs/common';
import type { PricedAvailability } from '@jordan-sports/contracts';
import type { Db } from '../../../platform/database/database.js';
import { DATABASE } from '../../../platform/database/database.module.js';
import { Errors } from '../../../platform/http/errors.js';
import { takesOnlineBookings } from '../../finance/index.js';
import { PricingService } from '../../pricing/index.js';
import { AvailabilityService, toApiSlot } from '../../scheduling/index.js';
import { SettingsService } from '../../settings/index.js';

/**
 * Public availability with prices. Slots without a price are not shown: a venue must price every
 * bookable time (the dashboard preview shows gaps).
 */
@Injectable()
export class AvailabilityViewService {
  constructor(
    @Inject(DATABASE) private readonly db: Db,
    private readonly settings: SettingsService,
    private readonly availability: AvailabilityService,
    private readonly pricing: PricingService,
  ) {}

  async forVenue(slug: string, date: string, now = new Date()): Promise<PricedAvailability> {
    const { venue, resources } = await this.availability.slotsForVenue(slug, date, now);
    if (!(await takesOnlineBookings(this.db, venue, await this.settings.cliqPayments(), now)))
      throw Errors.notFound();
    const rules = await this.pricing.rulesFor(resources.map((r) => r.resource.id));
    return {
      date,
      timezone: venue.timezone,
      resources: resources.map(({ resource, slots }) => ({
        resourceId: resource.id,
        slots: slots.flatMap((slot) => {
          const q = this.pricing.quoteSlot(
            venue,
            rules.get(resource.id) ?? [],
            slot.start,
            slot.durationMinutes,
            date,
          );
          return q
            ? [
                {
                  ...toApiSlot(slot, venue.timezone),
                  price: { amount: q.amount, currency: q.currency },
                },
              ]
            : [];
        }),
      })),
    };
  }
}
