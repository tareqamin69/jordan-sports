import { randomUUID } from 'node:crypto';
import {
  hasOrgPermission,
  hasPlatformPermission,
  type Endpoint,
  type MembershipRole,
  type PlatformRole,
} from '@jordan-sports/contracts';
import { DateTime } from 'luxon';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { allEndpoints } from '../../src/platform/auth/endpoint-registry.js';
import {
  call,
  catalogFixture,
  createOrganization,
  createTestApp,
  createVenue,
  randomPhone,
  signInAdmin,
  signInPlayer,
  type TestApp,
} from '../support/app.js';

/**
 * The authorization matrix (docs/rbac-plan.md): every protected endpoint in the contracts, called
 * as every role. Allowed → anything but 401/403 (and, on the venue API, 404). Blocked → 403 on the
 * admin API; on the venue API 403 for a member without the permission and 404 for anyone outside
 * the organization. A protected endpoint without a declared permission fails the suite.
 */

const PLATFORM_ROLES: PlatformRole[] = ['owner', 'admin', 'support', 'finance'];
const VENUE_ROLES: MembershipRole[] = ['owner', 'manager', 'staff'];

/** Admin endpoints open to any signed-in staff member (no permission by design). */
const ANY_STAFF = new Set(['GET /v1/admin/me', 'POST /v1/admin/auth/reauth']);
/** Venue-side endpoints not scoped to one organization (they act on the caller's own data). */
const NOT_ORG_SCOPED = new Set(['GET /v1/manage/venues', 'POST /v1/manage/venues']);

const key = (e: Endpoint) => `${e.method} ${e.path}`;

describe('authorization matrix', () => {
  let t: TestApp;
  const staff: Partial<Record<PlatformRole, string>> = {};
  const venue: Partial<Record<MembershipRole | 'outsider' | 'player', string>> = {};
  const ids: Record<string, string> = {};
  let ownerCookie = '';
  const tomorrow = DateTime.now().setZone('Asia/Amman').plus({ days: 1 }).toISODate()!;

  beforeAll(async () => {
    t = await createTestApp({ DATABASE_POOL_MAX: '20', RATE_LIMIT_SCALE: '50' });
    for (const role of PLATFORM_ROLES) staff[role] = (await signInAdmin(t.app, role)).cookie;

    // Organization A: owner, manager and staff; one approved venue with a bookable court.
    const org = await createOrganization(t.app, staff.owner!);
    const v = await createVenue(t.app, staff.owner!, org.id, { approve: true });
    ids.organizationId = org.id;
    ids.venueId = v.venueId;
    ids.resourceId = v.resourceIds[0]!;
    ownerCookie = (await signInPlayer(t.app, { phone: org.ownerPhone })).cookie;
    venue.owner = ownerCookie;
    for (const role of ['manager', 'staff'] as const) {
      const phone = randomPhone();
      const added = await call(t.app, {
        method: 'POST',
        url: `/v1/admin/organizations/${org.id}/members`,
        cookie: staff.owner!,
        body: { phone, displayName: role, role },
      });
      expect(added.statusCode, added.body).toBe(201);
      venue[role] = (await signInPlayer(t.app, { phone })).cookie;
    }
    const asOwner = (method: 'PUT' | 'POST', url: string, body: unknown) =>
      call(t.app, { method, url, cookie: ownerCookie, body });
    await asOwner('PUT', `/v1/manage/resources/${ids.resourceId}/weekly-hours`, {
      windows: [1, 2, 3, 4, 5, 6, 7].map((d) => ({
        dayOfWeek: d,
        startMinute: 480,
        durationMinutes: 960,
      })),
    });
    await asOwner('PUT', `/v1/manage/resources/${ids.resourceId}/policy`, {
      slotDurations: [60],
      startAlignmentMinutes: 60,
      minLeadMinutes: 0,
      maxAdvanceDays: 30,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 0,
    });
    ids.ruleId = await newPriceRule();

    // A player's confirmed booking at venue A, with a payment row (CliQ is off, so inserted).
    const player = await signInPlayer(t.app);
    venue.player = player.cookie;
    ids.userId = player.userId;
    const slot = (
      (
        await call(t.app, {
          method: 'GET',
          url: `/v1/venues/${v.slug}/availability?date=${tomorrow}`,
        })
      ).json() as { resources: Array<{ slots: Array<{ start: string }> }> }
    ).resources[0]!.slots[0]!;
    const held = await call(t.app, {
      method: 'POST',
      url: '/v1/bookings',
      cookie: player.cookie,
      headers: { 'idempotency-key': randomUUID() },
      body: { resourceId: ids.resourceId, start: slot.start, durationMinutes: 60 },
    });
    ids.bookingId = (held.json() as { id: string }).id;
    await t.ownerPool.query(
      `INSERT INTO payment.payments (id, booking_id, organization_id, venue_id, provider, amount, currency, status, payee_alias)
       VALUES ($1, $2, $3, $4, 'CLIQ_MANUAL', 1000, 'JOD', 'AWAITING_PROOF', 'ALIAS')`,
      [randomUUID(), ids.bookingId, org.id, v.venueId],
    );
    ids.paymentId = (
      await t.ownerPool.query<{ id: string }>(
        'SELECT id FROM payment.payments WHERE booking_id = $1',
        [ids.bookingId],
      )
    ).rows[0]!.id;
    ids.blockId = await newBlock();
    ids.overrideId = await newOverride();
    ids.mediaId = await newMedia();
    ids.memberId = (
      await t.ownerPool.query<{ id: string }>(
        `SELECT id FROM tenancy.memberships WHERE organization_id = $1 AND role = 'staff'`,
        [org.id],
      )
    ).rows[0]!.id;

    // Organization B: its owner is an outsider to A.
    const other = await createOrganization(t.app, staff.owner!);
    await createVenue(t.app, staff.owner!, other.id, { approve: true });
    venue.outsider = (await signInPlayer(t.app, { phone: other.ownerPhone })).cookie;

    const fx = await catalogFixture(t.app);
    ids.governorateId = fx.governorateId;
    ids.areaId = fx.areaId;
    const catalog = (await call(t.app, { method: 'GET', url: '/v1/catalog' })).json() as {
      sports: Array<{ id: string }>;
    };
    ids.sportId = catalog.sports[0]!.id;
  }, 120_000);

  afterAll(async () => {
    await t?.close();
  });

  // --- Fresh targets for destructive calls ------------------------------------------------------

  let blockMinute = 8 * 60;
  async function newBlock(): Promise<string> {
    blockMinute += 30;
    const r = await call(t.app, {
      method: 'POST',
      url: `/v1/manage/venues/${ids.venueId}/blocks`,
      cookie: ownerCookie,
      body: {
        resourceId: ids.resourceId,
        date: DateTime.now().setZone('Asia/Amman').plus({ days: 5 }).toISODate(),
        startTime: `${String(Math.floor(blockMinute / 60) % 24).padStart(2, '0')}:${String(blockMinute % 60).padStart(2, '0')}`,
        durationMinutes: 15,
        reason: 'maintenance',
      },
    });
    expect(r.statusCode, r.body).toBe(201);
    return (r.json() as { blockId: string }).blockId;
  }

  let overrideDay = 10;
  async function newOverride(): Promise<string> {
    overrideDay += 1;
    const date = DateTime.now().setZone('Asia/Amman').plus({ days: overrideDay }).toISODate();
    const r = await call(t.app, {
      method: 'POST',
      url: `/v1/manage/venues/${ids.venueId}/overrides`,
      cookie: ownerCookie,
      body: { dateFrom: date, dateTo: date, kind: 'closed' },
    });
    expect(r.statusCode, r.body).toBe(201);
    const overrides = (r.json() as { overrides: Array<{ id: string; dateFrom: string }> })
      .overrides;
    return overrides.find((o) => o.dateFrom === date)!.id;
  }

  let ruleStart = 0;
  async function newPriceRule(): Promise<string> {
    const before = await t.ownerPool.query<{ id: string }>('SELECT id FROM pricing.price_rules');
    ruleStart += 1;
    const r = await call(t.app, {
      method: 'POST',
      url: `/v1/manage/venues/${ids.venueId}/pricing`,
      cookie: ownerCookie,
      body: {
        resourceIds: [ids.resourceId],
        rule: {
          daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
          startMinute: 0,
          endMinute: 1440,
          priority: ruleStart,
          amounts: [{ durationMinutes: 60, amount: 20_000 }],
        },
      },
    });
    expect(r.statusCode, r.body).toBe(201);
    const known = new Set(before.rows.map((x) => x.id));
    const after = await t.ownerPool.query<{ id: string }>('SELECT id FROM pricing.price_rules');
    return after.rows.find((x) => !known.has(x.id))!.id;
  }

  async function newMedia(): Promise<string> {
    const id = randomUUID();
    await t.ownerPool.query(
      `INSERT INTO venue.media (id, venue_id, storage_key, content_type, width, height, byte_size)
       VALUES ($1, $2, $3, 'image/webp', 10, 10, 100)`,
      [id, ids.venueId, `${ids.venueId}/${id}.webp`],
    );
    return id;
  }

  async function newMember(): Promise<string> {
    const phone = randomPhone();
    await call(t.app, {
      method: 'POST',
      url: `/v1/admin/organizations/${ids.organizationId}/members`,
      cookie: staff.owner!,
      body: { phone, displayName: 'Temp', role: 'staff' },
    });
    return (
      await t.ownerPool.query<{ id: string }>(
        `SELECT m.id FROM tenancy.memberships m JOIN identity.users u ON u.id = m.user_id WHERE u.phone = $1`,
        [phone],
      )
    ).rows[0]!.id;
  }

  const factories: Record<string, () => Promise<string>> = {
    blockId: newBlock,
    overrideId: newOverride,
    ruleId: newPriceRule,
    mediaId: newMedia,
    memberId: newMember,
  };

  /** Path with real fixture ids; destructive calls get a fresh target each time. */
  async function urlFor(e: Endpoint): Promise<string> {
    const destructive = e.method === 'DELETE';
    let url = e.path;
    for (const [, name] of e.path.matchAll(/:(\w+)/g)) {
      const value =
        destructive && factories[name!] ? await factories[name!]!() : (ids[name!] ?? randomUUID());
      url = url.replace(`:${name}`, value);
    }
    return url;
  }

  const request = async (e: Endpoint, cookie: string | undefined) =>
    call(t.app, {
      method: e.method,
      url: await urlFor(e),
      ...(cookie ? { cookie } : {}),
      headers: { 'idempotency-key': randomUUID() },
      ...(e.method === 'GET' || e.method === 'DELETE' ? {} : { body: {} }),
    });

  // --- The matrix ---------------------------------------------------------------------------

  const admin = allEndpoints.filter((e) => e.auth === 'admin');
  const orgScoped = allEndpoints.filter((e) => e.auth === 'user' && e.orgPermission);

  it('every protected endpoint declares its permission', () => {
    const undeclaredAdmin = admin.filter((e) => !e.permission && !ANY_STAFF.has(key(e))).map(key);
    const undeclaredVenue = allEndpoints
      .filter((e) => e.auth === 'user' && e.path.startsWith('/v1/manage') && !e.orgPermission)
      .filter((e) => !NOT_ORG_SCOPED.has(key(e)))
      .map(key);
    expect(undeclaredAdmin).toEqual([]);
    expect(undeclaredVenue).toEqual([]);
    expect(admin.length).toBeGreaterThan(25);
    expect(orgScoped.length).toBeGreaterThan(25);
  });

  it.each(admin.map((e) => [key(e), e] as const))('admin API %s', async (_, e) => {
    const failures: string[] = [];
    // Anonymous visitors and player/venue sessions never reach the admin API.
    for (const [who, cookie] of [
      ['visitor', undefined],
      ['player', venue.player],
      ['venue owner', venue.owner],
    ] as const) {
      const r = await request(e, cookie);
      if (r.statusCode !== 401) failures.push(`${who}: expected 401, got ${r.statusCode}`);
    }
    for (const role of PLATFORM_ROLES) {
      const allowed = !e.permission || hasPlatformPermission(role, e.permission);
      const r = await request(e, staff[role]);
      const blocked = r.statusCode === 401 || r.statusCode === 403;
      if (allowed && blocked)
        failures.push(`${role}: should be allowed, got ${r.statusCode} ${r.body}`);
      if (!allowed && r.statusCode !== 403)
        failures.push(`${role}: should get 403, got ${r.statusCode}`);
    }
    expect(failures).toEqual([]);
  });

  it.each(orgScoped.map((e) => [key(e), e] as const))('venue API %s', async (_, e) => {
    const failures: string[] = [];
    for (const [who, cookie, expected] of [
      ['visitor', undefined, 401],
      ['player (no membership)', venue.player, 404],
      ['owner of another organization', venue.outsider, 404],
      ['platform owner (admin session)', staff.owner, 401],
    ] as const) {
      const r = await request(e, cookie);
      if (r.statusCode !== expected)
        failures.push(`${who}: expected ${expected}, got ${r.statusCode}`);
    }
    for (const role of VENUE_ROLES) {
      const allowed = hasOrgPermission(role, e.orgPermission!);
      const r = await request(e, venue[role]);
      const blocked = [401, 403, 404].includes(r.statusCode);
      if (allowed && blocked)
        failures.push(`${role}: should be allowed, got ${r.statusCode} ${r.body}`);
      if (!allowed && r.statusCode !== 403)
        failures.push(`${role}: should get 403, got ${r.statusCode}`);
    }
    expect(failures).toEqual([]);
  });

  it('players only ever reach their own bookings', async () => {
    const other = (await signInPlayer(t.app)).cookie;
    for (const url of [`/v1/bookings/${ids.bookingId}`]) {
      expect((await call(t.app, { method: 'GET', url, cookie: other })).statusCode).toBe(404);
    }
    for (const action of ['cancel', 'checkout', 'checkout/verify']) {
      const r = await call(t.app, {
        method: 'POST',
        url: `/v1/bookings/${ids.bookingId}/${action}`,
        cookie: other,
        headers: { 'idempotency-key': randomUUID() },
        body:
          action === 'checkout'
            ? { locale: 'en', acceptCancellationPolicy: true, confirmAdult: true }
            : {},
      });
      expect(r.statusCode, `${action}: ${r.body}`).toBe(404);
    }
  });

  it('front-desk staff never receive prices', async () => {
    const from = DateTime.now().setZone('Asia/Amman').toISODate();
    const to = DateTime.now().setZone('Asia/Amman').plus({ days: 7 }).toISODate();
    // The matrix above may have cancelled the fixture booking: add a fresh one by phone.
    const added = await call(t.app, {
      method: 'POST',
      url: `/v1/manage/venues/${ids.venueId}/bookings`,
      cookie: venue.owner!,
      headers: { 'idempotency-key': randomUUID() },
      body: {
        resourceId: ids.resourceId,
        date: DateTime.now().setZone('Asia/Amman').plus({ days: 2 }).toISODate(),
        startTime: '10:00',
        durationMinutes: 60,
        customer: { name: 'Walk-in' },
      },
    });
    expect(added.statusCode, added.body).toBe(201);
    const list = async (cookie: string) =>
      (
        (
          await call(t.app, {
            method: 'GET',
            url: `/v1/manage/venues/${ids.venueId}/bookings?from=${from}&to=${to}`,
            cookie,
          })
        ).json() as { items: Array<{ price: unknown }> }
      ).items;
    const asStaff = await list(venue.staff!);
    const asManager = await list(venue.manager!);
    expect(asManager.length).toBeGreaterThan(0);
    expect(asManager.every((b) => b.price !== null)).toBe(true);
    expect(asStaff.length).toBe(asManager.length);
    expect(asStaff.every((b) => b.price === null)).toBe(true);
    expect(JSON.stringify(asStaff)).not.toMatch(/"amount"/);
  });
});
