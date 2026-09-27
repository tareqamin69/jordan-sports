import { randomInt } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import pg from 'pg';
import { pino } from 'pino';
import { createHttpApp } from '../../src/http-app.js';
import { loadDotEnv, parseConfig, type AppConfig } from '../../src/platform/config/config.js';
import { createDatabase, createPool, type Db } from '../../src/platform/database/database.js';
import { Migrator } from '../../src/platform/database/migrator.js';
import { createTestDatabase, type TestDatabase } from './database.js';

export const WEB_ORIGIN = 'http://localhost:3000';
export const ADMIN_ORIGIN = 'http://localhost:3001';

export function testConfig(databaseUrl: string, overrides: Record<string, string> = {}): AppConfig {
  loadDotEnv();
  return parseConfig({
    NODE_ENV: 'test',
    DATABASE_URL: databaseUrl,
    DATABASE_POOL_MAX: '4',
    REDIS_URL: process.env.REDIS_URL ?? 'redis://127.0.0.1:6379',
    AUTH_SECRET: 'test-auth-secret-0123456789-abcdefghijklmnop',
    WEB_ORIGINS: WEB_ORIGIN,
    ADMIN_ORIGINS: ADMIN_ORIGIN,
    MEDIA_DIR: `/tmp/js-test-media-${process.pid}`,
    ...overrides,
  });
}

export interface TestApp {
  readonly app: NestFastifyApplication;
  readonly config: AppConfig;
  /** Kysely connected as the restricted application role (js_app). */
  readonly db: Db;
  /** Pool connected as the migration (owner) role, for assertions that need it. */
  readonly ownerPool: pg.Pool;
  close(): Promise<void>;
}

/** A fresh, migrated database and a fully wired API application. */
export async function createTestApp(overrides: Record<string, string> = {}): Promise<TestApp> {
  const database: TestDatabase = await createTestDatabase();
  const ownerPool = createPool({ connectionString: database.url, max: 2 });
  await new Migrator({ pool: ownerPool }).migrate();
  const config = testConfig(database.url, overrides);
  const app = await createHttpApp(config, pino({ level: 'silent' }));
  await app.getHttpAdapter().getInstance().ready();
  const appPool = createPool({
    connectionString: database.url,
    max: 2,
    appRole: config.databaseAppRole,
  });
  const db = createDatabase(appPool);
  return {
    app,
    config,
    db,
    ownerPool,
    async close() {
      await app.close();
      await db.destroy();
      await ownerPool.end();
      await database.drop();
    },
  };
}

/** A random, valid Jordanian mobile number (unique per test to isolate rate limits). */
export function randomPhone(): string {
  return `+9627${['7', '8', '9'][randomInt(0, 3)]}${String(randomInt(0, 10_000_000)).padStart(7, '0')}`;
}

/** A random client IP (unique per test to isolate IP-based rate limits). */
export function randomIp(): string {
  return `10.${randomInt(0, 256)}.${randomInt(0, 256)}.${randomInt(1, 255)}`;
}

type InjectOptions = {
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  url: string;
  body?: unknown;
  cookie?: string;
  origin?: string | null;
  ip?: string;
  headers?: Record<string, string>;
};

/** Calls the API like a browser on our web origin would (Origin header + cookies). */
export async function call(app: NestFastifyApplication, options: InjectOptions) {
  const headers: Record<string, string> = { ...options.headers };
  const origin =
    options.origin === undefined
      ? options.url.startsWith('/v1/admin/')
        ? ADMIN_ORIGIN
        : WEB_ORIGIN
      : options.origin;
  if (origin) headers.origin = origin;
  if (options.cookie) headers.cookie = options.cookie;
  const response = await app.inject({
    method: options.method,
    url: options.url,
    headers,
    remoteAddress: options.ip ?? '10.0.0.1',
    ...(options.body !== undefined ? { payload: options.body as object } : {}),
  });
  return response;
}

export function sessionCookie(
  response: { cookies: Array<{ name: string; value: string }> },
  name: string,
): string {
  const cookie = response.cookies.find((c) => c.name === name);
  if (!cookie) throw new Error(`Response did not set ${name}`);
  return `${name}=${cookie.value}`;
}

/** Signs up (or in) a player through the real OTP flow and returns the session cookie. */
export async function signInPlayer(
  app: NestFastifyApplication,
  options: { phone?: string; name?: string; ip?: string } = {},
): Promise<{ cookie: string; phone: string; userId: string }> {
  const phone = options.phone ?? randomPhone();
  const ip = options.ip ?? randomIp();
  const requested = await call(app, {
    method: 'POST',
    url: '/v1/auth/otp/request',
    body: { phone },
    ip,
  });
  if (requested.statusCode !== 200) throw new Error(`OTP request failed: ${requested.body}`);
  const otp = await call(app, {
    method: 'GET',
    url: `/v1/dev/otp?phone=${encodeURIComponent(phone)}`,
    ip,
  });
  const { code } = otp.json() as { code: string };
  const verified = await call(app, {
    method: 'POST',
    url: '/v1/auth/otp/verify',
    body: { phone, code },
    ip,
  });
  const body = verified.json() as { status: string; signupToken?: string; user?: { id: string } };
  if (body.status === 'signed_in') {
    return { cookie: sessionCookie(verified, 'js_session'), phone, userId: body.user!.id };
  }
  const signup = await call(app, {
    method: 'POST',
    url: '/v1/auth/signup',
    body: {
      signupToken: body.signupToken,
      displayName: options.name ?? 'Test Player',
      locale: 'ar',
      ageConfirmed: true,
    },
    ip,
  });
  if (signup.statusCode !== 200) throw new Error(`Signup failed: ${signup.body}`);
  return {
    cookie: sessionCookie(signup, 'js_session'),
    phone,
    userId: (signup.json() as { user: { id: string } }).user.id,
  };
}

/** Creates a platform staff member and signs them in (password + TOTP). */
export async function signInAdmin(
  app: NestFastifyApplication,
  role: 'super_admin' | 'admin' | 'support' | 'finance' = 'super_admin',
): Promise<{
  cookie: string;
  userId: string;
  email: string;
  password: string;
  totpSecret: string;
}> {
  const { AuthService } = await import('../../src/modules/identity/index.js');
  const { totpCode } = await import('../../src/platform/security/totp.js');
  const email = `admin-${randomInt(0, 1e9)}@example.com`;
  const password = 'correct horse battery staple';
  const { userId, totpSecret } = await app.get(AuthService).createPlatformUser({
    email,
    displayName: `Admin ${role}`,
    password,
    role,
  });
  const response = await call(app, {
    method: 'POST',
    url: '/v1/admin/auth/sign-in',
    body: { email, password, totpCode: totpCode(totpSecret) },
    ip: randomIp(),
  });
  if (response.statusCode !== 200) throw new Error(`Admin sign-in failed: ${response.body}`);
  return {
    cookie: sessionCookie(response, 'js_admin_session'),
    userId,
    email,
    password,
    totpSecret,
  };
}

/** Test-only: clears rate-limit counters for a subject (phone/IP) so a flow can be repeated. */
export async function resetRateLimits(app: NestFastifyApplication, subject: string): Promise<void> {
  const { REDIS } = await import('../../src/platform/redis/redis.module.js');
  const redis = app.get<import('ioredis').Redis>(REDIS);
  const keys = await redis.keys(`rl:*:${subject}:*`);
  if (keys.length > 0) await redis.del(...keys);
}

/** Creates an organization through the admin API and returns its id and owner phone. */
export async function createOrganization(
  app: NestFastifyApplication,
  adminCookie: string,
): Promise<{ id: string; ownerPhone: string }> {
  const ownerPhone = randomPhone();
  const r = await call(app, {
    method: 'POST',
    url: '/v1/admin/organizations',
    cookie: adminCookie,
    body: {
      slug: `org-${Date.now()}-${randomInt(0, 1e6)}`,
      name: { ar: 'منشأة اختبار', en: 'Test Org' },
      owner: { phone: ownerPhone, displayName: 'Owner' },
    },
  });
  if (r.statusCode !== 201) throw new Error(`Create organization failed: ${r.body}`);
  return { id: (r.json() as { id: string }).id, ownerPhone };
}

export interface CatalogFixture {
  governorateId: string;
  areaId: string;
  types: Record<string, { id: string; sportFormatIds: string[] }>;
  formats: Record<string, string>;
  amenityIds: string[];
}

/** Looks up reference data by key (keys are test data; the application never uses them). */
export async function catalogFixture(app: NestFastifyApplication): Promise<CatalogFixture> {
  const catalog = (await call(app, { method: 'GET', url: '/v1/catalog' })).json() as {
    sports: Array<{ key: string; formats: Array<{ id: string; key: string }> }>;
    resourceTypes: Array<{ id: string; key: string; sportFormatIds: string[] }>;
    amenities: Array<{ id: string }>;
    governorates: Array<{ id: string; key: string; areas: Array<{ id: string }> }>;
  };
  const amman = catalog.governorates.find((c) => c.key === 'amman')!;
  return {
    governorateId: amman.id,
    areaId: amman.areas[0]!.id,
    types: Object.fromEntries(
      catalog.resourceTypes.map((t) => [t.key, { id: t.id, sportFormatIds: t.sportFormatIds }]),
    ),
    formats: Object.fromEntries(
      catalog.sports.flatMap((s) => s.formats.map((f) => [`${s.key}.${f.key}`, f.id])),
    ),
    amenityIds: catalog.amenities.map((a) => a.id),
  };
}

/** Creates a venue with one active resource of the given type (default: padel court). */
export async function createVenue(
  app: NestFastifyApplication,
  adminCookie: string,
  organizationId: string,
  options: { approve?: boolean; typeKey?: string; formatKey?: string; slug?: string } = {},
): Promise<{ venueId: string; slug: string; resourceIds: string[] }> {
  const fx = await catalogFixture(app);
  const slug = options.slug ?? `venue-${Date.now()}-${randomInt(0, 1e6)}`;
  const venue = await call(app, {
    method: 'POST',
    url: `/v1/admin/organizations/${organizationId}/venues`,
    cookie: adminCookie,
    body: {
      slug,
      name: { ar: 'ملعب الاختبار', en: 'Test Venue' },
      governorateId: fx.governorateId,
      areaId: fx.areaId,
    },
  });
  if (venue.statusCode !== 201) throw new Error(`Create venue failed: ${venue.body}`);
  const venueId = (venue.json() as { id: string }).id;
  const typeKey = options.typeKey ?? 'padel_court';
  const formatKey = options.formatKey ?? 'padel.doubles';
  const resource = await call(app, {
    method: 'POST',
    url: `/v1/admin/venues/${venueId}/resources`,
    cookie: adminCookie,
    body: {
      name: { ar: 'ملعب 1', en: 'Court 1' },
      resourceTypeId: fx.types[typeKey]!.id,
      sportFormatIds: [fx.formats[formatKey]],
    },
  });
  if (resource.statusCode !== 201) throw new Error(`Create resource failed: ${resource.body}`);
  if (options.approve) {
    const r = await call(app, {
      method: 'POST',
      url: `/v1/admin/venues/${venueId}/status`,
      cookie: adminCookie,
      body: { status: 'approved', reason: 'Pilot venue verified' },
    });
    if (r.statusCode !== 201) throw new Error(`Approve failed: ${r.body}`);
  }
  const resources = (resource.json() as { resources: Array<{ id: string }> }).resources;
  return { venueId, slug, resourceIds: resources.map((r) => r.id) };
}
