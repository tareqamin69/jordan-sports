import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SettingsService } from '../../src/modules/settings/index.js';
import {
  call,
  createOrganization,
  createTestApp,
  createVenue,
  signInAdmin,
  type TestApp,
} from '../support/app.js';

/** Owner settings (docs/rbac-plan.md §7): commission, support WhatsApp, flags, IP allowlist. */
describe('platform settings', () => {
  let t: TestApp;
  let owner: string;
  let admin: string;

  beforeAll(async () => {
    t = await createTestApp({ RATE_LIMIT_SCALE: '50' });
    owner = (await signInAdmin(t.app, 'owner')).cookie;
    admin = (await signInAdmin(t.app, 'admin')).cookie;
  });
  afterAll(async () => {
    await t?.close();
  });

  const patch = (body: unknown, cookie = owner, ip?: string) =>
    call(t.app, {
      method: 'PATCH',
      url: '/v1/admin/settings',
      cookie,
      body,
      ...(ip ? { ip } : {}),
    });
  const catalog = async () =>
    (await call(t.app, { method: 'GET', url: '/v1/catalog' })).json() as {
      support: { whatsapp: string | null; email: string | null };
      company: {
        name: { ar?: string; en?: string } | null;
        registrationNo: string | null;
        address: { ar?: string; en?: string } | null;
      };
    };

  it('only the owner changes settings; admins can read them', async () => {
    expect(
      (await call(t.app, { method: 'GET', url: '/v1/admin/settings', cookie: admin })).statusCode,
    ).toBe(200);
    expect((await patch({ commissionBps: 900 }, admin)).statusCode).toBe(403);
    const support = (await signInAdmin(t.app, 'support')).cookie;
    expect(
      (await call(t.app, { method: 'GET', url: '/v1/admin/settings', cookie: support })).statusCode,
    ).toBe(403);
  });

  it('sets the support WhatsApp and e-mail, visible to the apps at once', async () => {
    expect((await catalog()).support).toEqual({ whatsapp: null, email: null });
    const r = await patch({ supportWhatsapp: '0791234567', supportEmail: 'Help@Jorena.app' });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toMatchObject({
      supportWhatsapp: '+962791234567',
      supportEmail: 'help@jorena.app',
    });
    expect((await catalog()).support).toEqual({
      whatsapp: '+962791234567',
      email: 'help@jorena.app',
    });
    // null hides them again (e.g. before the domain's mailbox exists).
    await patch({ supportWhatsapp: null, supportEmail: null });
    expect((await catalog()).support).toEqual({ whatsapp: null, email: null });
    expect((await patch({ supportEmail: 'not-an-email' })).statusCode).toBe(400);
    expect((await patch({ supportWhatsapp: '12345678' })).json()).toMatchObject({
      code: 'INVALID_PHONE',
    });
  });

  it('company details are empty until the owner fills them in, then shown as written', async () => {
    expect((await catalog()).company).toEqual({ name: null, registrationNo: null, address: null });
    const r = await patch({
      company: { nameAr: 'شركة جورينا ذ.م.م', nameEn: 'Jorena LLC', registrationNo: '12345' },
    });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toMatchObject({
      company: {
        nameAr: 'شركة جورينا ذ.م.م',
        nameEn: 'Jorena LLC',
        registrationNo: '12345',
        addressAr: null,
      },
    });
    expect((await catalog()).company).toEqual({
      name: { ar: 'شركة جورينا ذ.م.م', en: 'Jorena LLC' },
      registrationNo: '12345',
      address: null,
    });
    // Only the fields sent change; null clears one.
    await patch({ company: { registrationNo: null } });
    expect((await catalog()).company).toMatchObject({
      registrationNo: null,
      name: { en: 'Jorena LLC' },
    });
    await patch({ company: { nameAr: null, nameEn: null } });
    expect((await catalog()).company.name).toBeNull();
  });

  it('records every change with before and after values', async () => {
    await patch({ commissionBps: 950 });
    const row = await t.ownerPool.query<{
      details: { before: { commissionBps: number }; after: { commissionBps: number } };
    }>(
      "SELECT details FROM audit.audit_logs WHERE action = 'settings.updated' ORDER BY id DESC LIMIT 1",
    );
    expect(row.rows[0]!.details.after.commissionBps).toBe(950);
    expect(row.rows[0]!.details.before.commissionBps).not.toBe(950);
  });

  it('venues follow the default commission unless the owner overrides it', async () => {
    const org = await createOrganization(t.app, admin);
    const venue = await createVenue(t.app, admin, org.id);
    const effective = async () =>
      (
        await t.ownerPool.query<{ bps: number }>(
          'SELECT coalesce(commission_bps, (SELECT commission_bps FROM platform.settings)) AS bps FROM venue.venues WHERE id = $1',
          [venue.venueId],
        )
      ).rows[0]!.bps;
    await patch({ commissionBps: 700 });
    expect(await effective()).toBe(700);
    const set = (commissionBps: number | null, cookie = owner) =>
      call(t.app, {
        method: 'PUT',
        url: `/v1/admin/venues/${venue.venueId}/commission`,
        cookie,
        body: { commissionBps, reason: 'Pilot partner rate' },
      });
    expect((await set(500, admin)).statusCode).toBe(403);
    expect((await set(500)).statusCode).toBe(200);
    expect(await effective()).toBe(500);
    await set(null);
    expect(await effective()).toBe(700);
  });

  it('limits the admin panel to allowed addresses without letting the owner lock themselves out', async () => {
    const r = await patch({ adminIpAllowlist: ['203.0.113.0/24'] }, owner, '10.9.9.9');
    expect(r.json()).toMatchObject({ code: 'VALIDATION_FAILED' });
    expect((await patch({ adminIpAllowlist: ['not-an-ip'] })).statusCode).toBe(400);

    const ok = await patch(
      { adminIpAllowlist: ['10.9.9.0/24', '2001:db8::/32'] },
      owner,
      '10.9.9.9',
    );
    expect(ok.statusCode, ok.body).toBe(200);
    const me = (ip: string) =>
      call(t.app, { method: 'GET', url: '/v1/admin/me', cookie: owner, ip });
    expect((await me('10.9.9.20')).statusCode).toBe(200);
    expect((await me('10.1.1.1')).json()).toMatchObject({ code: 'IP_NOT_ALLOWED' });
    const signIn = await call(t.app, {
      method: 'POST',
      url: '/v1/admin/auth/sign-in',
      body: { email: 'x@example.com', password: 'whatever', totpCode: '123456' },
      ip: '10.1.1.1',
    });
    expect(signIn.json()).toMatchObject({ code: 'IP_NOT_ALLOWED' });
    // Players are never affected.
    expect(
      (await call(t.app, { method: 'GET', url: '/v1/catalog', ip: '10.1.1.1' })).statusCode,
    ).toBe(200);

    await t.app.get(SettingsService).clearAdminIpAllowlist();
    expect((await me('10.1.1.1')).statusCode).toBe(200);
  });
});
