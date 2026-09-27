import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { NestFactory } from '@nestjs/core';
import sharp from 'sharp';
import { AppModule } from '../app.module.js';
import { CatalogService } from '../modules/catalog/index.js';
import { OrganizationsService } from '../modules/tenancy/index.js';
import { ResourcesService } from '../modules/resources/index.js';
import { MediaService, VenuesService, type Actor } from '../modules/venues/index.js';
import { loadDotEnv, parseConfig } from '../platform/config/config.js';
import { DATABASE } from '../platform/database/database.module.js';
import type { Db } from '../platform/database/database.js';
import { uuidv7 } from '../platform/database/ids.js';
import { demoPhotoSvg, demoPhotoVariants, type DemoPhotoKind } from './demo-photos.js';

/**
 * DEVELOPMENT ONLY: creates clearly labelled demo venues so the product can be explored locally.
 * Refuses to run in production. Idempotent (skips venues whose slug already exists).
 *
 *   pnpm --filter @jordan-sports/api seed:demo
 */
const DEMO_OWNER_PHONE = '+962790000001';

interface DemoResource {
  name: { ar: string; en: string };
  type: string;
  formats: string[];
  attributes?: Record<string, string | boolean>;
  combines?: number[];
  prices: Record<string, number>;
}

interface DemoVenue {
  slug: string;
  name: { ar: string; en: string };
  description: { ar: string; en: string };
  address: { ar: string; en: string };
  area: string;
  location: { lat: number; lng: number };
  phone: string;
  photo: DemoPhotoKind;
  resources: DemoResource[];
}

const SEED_FILE = fileURLToPath(new URL('../../seeds/demo-venues.json', import.meta.url));

/** Generated illustration (no real photos in the repository). */
async function photo(
  kind: DemoPhotoKind,
  variant: (typeof demoPhotoVariants)[number],
): Promise<Buffer> {
  return sharp(Buffer.from(demoPhotoSvg(kind, variant)))
    .jpeg({ quality: 85 })
    .toBuffer();
}

async function main(): Promise<number> {
  loadDotEnv();
  const config = parseConfig(process.env);
  if (config.nodeEnv === 'production' && !config.staging) {
    console.error('Refusing to seed demo data in production.');
    return 1;
  }
  const app = await NestFactory.createApplicationContext(AppModule.forRoot(config), {
    logger: false,
  });
  try {
    const db = app.get<Db>(DATABASE);
    const catalog = await app.get(CatalogService).get();
    const venues = JSON.parse(readFileSync(SEED_FILE, 'utf8')) as DemoVenue[];
    const systemActor: Actor = {
      type: 'system',
      userId: null,
      meta: { ip: null, userAgent: 'seed-demo', requestId: 'seed-demo' },
    };

    let org = await db
      .selectFrom('tenancy.organizations')
      .select('id')
      .where('slug', '=', 'demo-sports-group')
      .executeTakeFirst();
    if (!org) {
      const created = await app.get(OrganizationsService).create(
        null,
        {
          slug: 'demo-sports-group',
          name: { ar: 'مجموعة رياضية تجريبية', en: 'Demo Sports Group' },
          owner: { phone: DEMO_OWNER_PHONE, displayName: 'أبو أحمد' },
        },
        systemActor.meta,
      );
      org = { id: created.id };
    }

    const city = catalog.governorates.find((g) => g.key === 'amman')!;
    const typeId = (key: string) => catalog.resourceTypes.find((t) => t.key === key)!.id;
    const formatId = (ref: string) => {
      const [sport, format] = ref.split('.');
      return catalog.sports.find((s) => s.key === sport)!.formats.find((f) => f.key === format)!.id;
    };

    for (const demo of venues) {
      const existing = await app.get(VenuesService).findBySlug(demo.slug);
      if (existing) {
        console.log(`skip ${demo.slug} (exists)`);
        continue;
      }
      const venueId = await app.get(VenuesService).create(
        org.id,
        {
          slug: demo.slug,
          name: demo.name,
          description: demo.description,
          address: demo.address,
          location: demo.location,
          contactPhone: demo.phone,
          governorateId: city.id,
          areaId: city.areas.find((a) => a.key === demo.area)!.id,
          amenityIds: catalog.amenities.slice(0, 4).map((a) => a.id),
        },
        systemActor,
      );
      const ids: string[] = [];
      for (const r of demo.resources) {
        ids.push(
          await app.get(ResourcesService).create(
            venueId,
            org.id,
            {
              name: r.name,
              resourceTypeId: typeId(r.type),
              sportFormatIds: r.formats.map(formatId),
              attributes: r.attributes ?? {},
              ...(r.combines ? { combinesResourceIds: r.combines.map((i) => ids[i]!) } : {}),
            },
            systemActor,
          ),
        );
      }
      for (const variant of demoPhotoVariants) {
        await app
          .get(MediaService)
          .upload(venueId, org.id, await photo(demo.photo, variant), 'image/jpeg', systemActor);
      }
      await app
        .get(VenuesService)
        .setStatus(
          venueId,
          'approved',
          'Demo data (development only)',
          systemActor,
          async () => true,
        );
      console.log(`created ${demo.slug}`);
    }
    // Opening hours for demo resources that have none: every day 08:00–24:00.
    const demoResources = await db
      .selectFrom('resource.resources as r')
      .innerJoin('venue.venues as v', 'v.id', 'r.venue_id')
      .select('r.id')
      .where('v.organization_id', '=', org.id)
      .where((eb) =>
        eb.not(
          eb.exists(
            eb
              .selectFrom('scheduling.weekly_hours as h')
              .select('h.id')
              .whereRef('h.resource_id', '=', 'r.id'),
          ),
        ),
      )
      .execute();
    for (const r of demoResources) {
      await db
        .insertInto('scheduling.weekly_hours')
        .values(
          [1, 2, 3, 4, 5, 6, 7].map((day) => ({
            id: uuidv7(),
            resource_id: r.id,
            day_of_week: day,
            start_minute: 480,
            duration_minutes: 960,
          })),
        )
        .execute();
    }
    // Prices for demo resources without any: the demo JSON price all day, plus +25% from 18:00.
    for (const demo of venues) {
      const venue = await app.get(VenuesService).findBySlug(demo.slug);
      if (!venue) continue;
      const resources = await app.get(ResourcesService).listForVenue(venue.id);
      for (const resource of resources) {
        const spec = demo.resources.find((r) => r.name.en === resource.name.en);
        if (spec) {
          // Bookable lengths = the priced lengths.
          await db
            .updateTable('resource.booking_policies')
            .set({ slot_durations: Object.keys(spec.prices).map(Number) })
            .where('resource_id', '=', resource.id)
            .execute();
        }
        const priced = await db
          .selectFrom('pricing.price_rules')
          .select('id')
          .where('resource_id', '=', resource.id)
          .executeTakeFirst();
        if (!spec || priced) continue;
        const bands = [
          {
            start: venue.businessDayStartMinute,
            end: venue.businessDayStartMinute + 1440,
            priority: 0,
            factor: 1,
            label: null,
          },
          { start: 18 * 60, end: 24 * 60, priority: 10, factor: 1.25, label: 'وقت الذروة' },
        ];
        for (const band of bands) {
          const ruleId = uuidv7();
          await db
            .insertInto('pricing.price_rules')
            .values({
              id: ruleId,
              venue_id: venue.id,
              resource_id: resource.id,
              days_of_week: [1, 2, 3, 4, 5, 6, 7],
              start_minute: band.start,
              end_minute: band.end,
              priority: band.priority,
              currency: venue.currency,
              label: band.label,
            })
            .execute();
          await db
            .insertInto('pricing.price_rule_amounts')
            .values(
              Object.entries(spec.prices).map(([duration, amount]) => ({
                rule_id: ruleId,
                duration_minutes: Number(duration),
                amount: String(Math.round((amount * band.factor) / 500) * 500),
              })),
            )
            .execute();
        }
      }
    }
    console.log(`Demo owner phone (sign in with the dev OTP): ${DEMO_OWNER_PHONE}`);
    return 0;
  } finally {
    await app.close();
  }
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  },
);
