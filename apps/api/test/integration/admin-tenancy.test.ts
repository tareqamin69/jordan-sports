import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { totpCode } from '../../src/platform/security/totp.js';
import {
  call,
  createTestApp,
  randomIp,
  randomPhone,
  resetRateLimits,
  signInAdmin,
  signInPlayer,
  type TestApp,
} from '../support/app.js';

describe('platform admin and tenancy', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t?.close();
  });

  describe('admin sign-in (password + TOTP)', () => {
    it('signs in with valid credentials and exposes permissions', async () => {
      const admin = await signInAdmin(t.app, 'support');
      const me = await call(t.app, { method: 'GET', url: '/v1/admin/me', cookie: admin.cookie });
      expect(me.statusCode).toBe(200);
      expect(me.json()).toMatchObject({ email: admin.email, platformRole: 'support' });
      expect((me.json() as { permissions: string[] }).permissions).not.toContain('users.manage');
    });

    it('rejects a wrong password, a wrong code and a replayed code with the same generic error', async () => {
      const admin = await signInAdmin(t.app);
      const nextStep = Date.now() + 30_000;
      const attempts = [
        {
          email: admin.email,
          password: 'wrong password!!',
          totpCode: totpCode(admin.totpSecret, nextStep),
        },
        { email: admin.email, password: admin.password, totpCode: '000000' },
        // The code used by signInAdmin (current step) cannot be used again.
        { email: admin.email, password: admin.password, totpCode: totpCode(admin.totpSecret) },
        {
          email: 'nobody@example.com',
          password: admin.password,
          totpCode: totpCode(admin.totpSecret),
        },
      ];
      for (const body of attempts) {
        const r = await call(t.app, {
          method: 'POST',
          url: '/v1/admin/auth/sign-in',
          body,
          ip: randomIp(),
        });
        expect(r.statusCode).toBe(401);
        expect(r.json()).toMatchObject({ code: 'INVALID_CREDENTIALS' });
      }
    });

    it('does not accept player sessions on admin routes', async () => {
      const player = await signInPlayer(t.app);
      const r = await call(t.app, { method: 'GET', url: '/v1/admin/me', cookie: player.cookie });
      expect(r.statusCode).toBe(401);
    });

    it('enforces role permissions', async () => {
      const support = await signInAdmin(t.app, 'support');
      const player = await signInPlayer(t.app);
      const r = await call(t.app, {
        method: 'POST',
        url: `/v1/admin/users/${player.userId}/status`,
        cookie: support.cookie,
        body: { status: 'suspended', reason: 'testing permissions' },
      });
      expect(r.statusCode).toBe(403);
    });
  });

  describe('organizations', () => {
    it('creates an organization with an owner who later signs up and sees the membership', async () => {
      const admin = await signInAdmin(t.app);
      const ownerPhone = randomPhone();
      const created = await call(t.app, {
        method: 'POST',
        url: '/v1/admin/organizations',
        cookie: admin.cookie,
        body: {
          slug: `amman-arena-${Date.now()}`,
          name: { ar: 'ساحة عمّان', en: 'Amman Arena' },
          owner: { phone: ownerPhone, displayName: 'Owner Name' },
        },
      });
      expect(created.statusCode).toBe(201);
      const org = created.json() as {
        id: string;
        slug: string;
        members: Array<{ role: string; phone: string }>;
      };
      expect(org.members).toEqual([expect.objectContaining({ role: 'owner', phone: ownerPhone })]);

      // Duplicate slug.
      const dup = await call(t.app, {
        method: 'POST',
        url: '/v1/admin/organizations',
        cookie: admin.cookie,
        body: {
          slug: org.slug,
          name: { en: 'Other' },
          owner: { phone: randomPhone(), displayName: 'X' },
        },
      });
      expect(dup.statusCode).toBe(409);
      expect(dup.json()).toMatchObject({ code: 'SLUG_TAKEN' });

      // The pre-created owner must still confirm name and age on first sign-in.
      const owner = await signInPlayer(t.app, { phone: ownerPhone, name: 'Owner Chosen Name' });
      const me = await call(t.app, { method: 'GET', url: '/v1/me', cookie: owner.cookie });
      expect(me.json()).toMatchObject({
        displayName: 'Owner Chosen Name',
        memberships: [
          { organizationId: org.id, role: 'owner', organizationName: { en: 'Amman Arena' } },
        ],
      });

      // Audited.
      const audit = await call(t.app, {
        method: 'GET',
        url: `/v1/admin/audit-logs?organizationId=${org.id}`,
        cookie: admin.cookie,
      });
      expect(
        (audit.json() as { items: Array<{ action: string }> }).items.map((i) => i.action),
      ).toContain('organization.created');
    });

    it('adds members and rejects duplicates', async () => {
      const admin = await signInAdmin(t.app);
      const org = (
        await call(t.app, {
          method: 'POST',
          url: '/v1/admin/organizations',
          cookie: admin.cookie,
          body: {
            slug: `club-${Date.now()}`,
            name: { ar: 'نادي' },
            owner: { phone: randomPhone(), displayName: 'O' },
          },
        })
      ).json() as { id: string };
      const phone = randomPhone();
      const add = () =>
        call(t.app, {
          method: 'POST',
          url: `/v1/admin/organizations/${org.id}/members`,
          cookie: admin.cookie,
          body: { phone, displayName: 'Staff', role: 'staff' },
        });
      expect((await add()).statusCode).toBe(201);
      expect((await add()).json()).toMatchObject({ code: 'ALREADY_MEMBER' });
    });
  });

  describe('user suspension', () => {
    it('suspends a user, revokes their sessions and records the reason', async () => {
      const admin = await signInAdmin(t.app);
      const player = await signInPlayer(t.app);
      const r = await call(t.app, {
        method: 'POST',
        url: `/v1/admin/users/${player.userId}/status`,
        cookie: admin.cookie,
        body: { status: 'suspended', reason: 'Repeated abuse reports' },
      });
      expect(r.json()).toMatchObject({ status: 'suspended' });
      expect(
        (await call(t.app, { method: 'GET', url: '/v1/me', cookie: player.cookie })).statusCode,
      ).toBe(401);

      // Cannot sign in again while suspended.
      await resetRateLimits(t.app, player.phone);
      const ip = randomIp();
      await call(t.app, {
        method: 'POST',
        url: '/v1/auth/otp/request',
        body: { phone: player.phone },
        ip,
      });
      const otp = await call(t.app, {
        method: 'GET',
        url: `/v1/dev/otp?phone=${encodeURIComponent(player.phone)}`,
      });
      const verify = await call(t.app, {
        method: 'POST',
        url: '/v1/auth/otp/verify',
        body: { phone: player.phone, code: (otp.json() as { code: string }).code },
        ip,
      });
      expect(verify.json()).toMatchObject({ code: 'ACCOUNT_SUSPENDED' });

      const audit = await call(t.app, {
        method: 'GET',
        url: '/v1/admin/audit-logs',
        cookie: admin.cookie,
      });
      expect(
        (audit.json() as { items: Array<{ action: string; reason: string }> }).items,
      ).toContainEqual(
        expect.objectContaining({ action: 'user.suspended', reason: 'Repeated abuse reports' }),
      );
    });
  });

  describe('database privileges of the application role', () => {
    it('cannot modify or delete audit log entries', async () => {
      await signInAdmin(t.app);
      await expect(
        t.db.updateTable('audit.audit_logs').set({ reason: 'tampered' }).execute(),
      ).rejects.toThrow(/permission denied/);
      await expect(t.db.deleteFrom('audit.audit_logs').execute()).rejects.toThrow(
        /permission denied/,
      );
    });

    it('is blocked by the append-only trigger even for the owner role', async () => {
      await signInAdmin(t.app);
      await expect(t.ownerPool.query(`UPDATE audit.audit_logs SET reason = 'x'`)).rejects.toThrow(
        /append-only/,
      );
    });

    it('cannot run DDL', async () => {
      await expect(
        t.db.schema.createTable('identity.evil').addColumn('id', 'integer').execute(),
      ).rejects.toThrow(/permission denied/);
    });
  });
});
