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
  area: string;
  color: string;
  resources: DemoResource[];
}

const SEED_FILE = fileURLToPath(new URL('../../seeds/demo-venues.json', import.meta.url));

/** A plain generated banner image (no real photos in the repository). */
async function banner(color: string): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900">
    <rect width="1600" height="900" fill="${color}"/>
    <rect x="200" y="150" width="1200" height="600" fill="none" stroke="#ffffff" stroke-width="12" opacity="0.6"/>
    <line x1="800" y1="150" x2="800" y2="750" stroke="#ffffff" stroke-width="12" opacity="0.6"/>
    <circle cx="800" cy="450" r="110" fill="none" stroke="#ffffff" stroke-width="12" opacity="0.6"/>
  </svg>`;
  return sharp(Buffer.from(svg)).jpeg().toBuffer();
}

async function main(): Promise<number> {
  loadDotEnv();
  const config = parseConfig(process.env);
  if (config.nodeEnv === 'production') {
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
          owner: { phone: DEMO_OWNER_PHONE, displayName: 'Demo Owner' },
        },
        systemActor.meta,
      );
      org = { id: created.id };
    }

    const city = catalog.cities.find((c) => c.key === 'amman')!;
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
          cityId: city.id,
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
      await app
        .get(MediaService)
        .upload(venueId, org.id, await banner(demo.color), 'image/jpeg', systemActor);
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
    // Opening hours for demo resources that have none: 16:00–24:00, Friday and Saturday from 10:00.
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
            start_minute: day === 5 || day === 6 ? 600 : 960,
            duration_minutes: day === 5 || day === 6 ? 840 : 480,
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
          { start: 18 * 60, end: 24 * 60, priority: 10, factor: 1.25, label: 'Peak' },
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
