import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OutboxDispatcher } from '../../src/modules/notifications/index.js';
import { OwnerExistsError, StaffSetupService } from '../../src/modules/identity/index.js';
import { totpCode } from '../../src/platform/security/totp.js';
import {
  call,
  createOrganization,
  createVenue,
  createTestApp,
  randomIp,
  sessionCookie,
  signInAdmin,
  type TestApp,
} from '../support/app.js';

/** Security of platform staff accounts (docs/rbac-plan.md §6). */
describe('admin account security', () => {
  let t: TestApp;
  let setup: StaffSetupService;

  beforeAll(async () => {
    t = await createTestApp({ RATE_LIMIT_SCALE: '50' });
    setup = t.app.get(StaffSetupService);
  });
  afterAll(async () => {
    await t?.close();
  });

  const signIn = (body: { email: string; password: string; totpCode: string }, cookie?: string) =>
    call(t.app, {
      method: 'POST',
      url: '/v1/admin/auth/sign-in',
      body,
      ip: randomIp(),
      ...(cookie ? { cookie } : {}),
    });
  const resetStep = (userId: string) =>
    t.ownerPool.query(
      'UPDATE identity.totp_credentials SET last_used_step = 0 WHERE user_id = $1',
      [userId],
    );

  describe('owner setup link', () => {
    let ownerCookie = '';

    it('lets the owner choose a password and enrol an authenticator, once', async () => {
      const link = await setup.createLink({
        purpose: 'owner_setup',
        email: 'Owner@Example.com',
        role: 'owner',
      });
      const inspect = await call(t.app, {
        method: 'POST',
        url: '/v1/admin/setup/inspect',
        body: { token: link.token },
      });
      expect(inspect.statusCode).toBe(200);
      const details = inspect.json() as { email: string; totpSecret: string; otpauthUri: string };
      expect(details.email).toBe('owner@example.com');
      expect(details.otpauthUri).toMatch(/^otpauth:\/\/totp\//);

      const complete = (overrides: Record<string, string>) =>
        call(t.app, {
          method: 'POST',
          url: '/v1/admin/setup/complete',
          body: {
            token: link.token,
            displayName: 'Owner',
            password: 'a long owner passphrase',
            totpCode: totpCode(details.totpSecret),
            ...overrides,
          },
        });
      expect((await complete({ totpCode: '000000' })).statusCode).toBe(401);
      expect((await complete({ password: 'short' })).statusCode).toBe(400);
      const done = await complete({});
      expect(done.statusCode, done.body).toBe(200);
      expect(done.json()).toMatchObject({ platformRole: 'owner', email: 'owner@example.com' });
      ownerCookie = sessionCookie(done, 'js_admin_session');
      expect(done.cookies.find((c) => c.name === 'js_admin_device')).toBeDefined();

      const again = await complete({});
      expect(again.json()).toMatchObject({ code: 'SETUP_LINK_INVALID' });
      const me = await call(t.app, { method: 'GET', url: '/v1/admin/me', cookie: ownerCookie });
      expect(me.statusCode).toBe(200);

      // The token is stored only as a hash, and it was never written to the audit log.
      const stored = await t.ownerPool.query(
        "SELECT count(*)::int AS n FROM audit.audit_logs WHERE details::text LIKE '%' || $1 || '%'",
        [link.token],
      );
      expect(stored.rows[0].n).toBe(0);
    });

    it('refuses a second owner unless ownership is handed over explicitly', async () => {
      await expect(
        setup.createLink({ purpose: 'owner_setup', email: 'other@example.com', role: 'owner' }),
      ).rejects.toBeInstanceOf(OwnerExistsError);
      await expect(
        setup.createLink({ purpose: 'staff_invite', email: 'x@example.com', role: 'owner' }),
      ).rejects.toThrow();

      const handover = await setup.createLink({
        purpose: 'owner_setup',
        email: 'new-owner@example.com',
        role: 'owner',
        replaceOwner: true,
      });
      const { totpSecret } = (
        await call(t.app, {
          method: 'POST',
          url: '/v1/admin/setup/inspect',
          body: { token: handover.token },
        })
      ).json() as { totpSecret: string };
      const done = await call(t.app, {
        method: 'POST',
        url: '/v1/admin/setup/complete',
        body: {
          token: handover.token,
          displayName: 'New owner',
          password: 'another long passphrase',
          totpCode: totpCode(totpSecret),
        },
      });
      expect(done.statusCode, done.body).toBe(200);
      const roles = await t.ownerPool.query(
        "SELECT email, platform_role FROM identity.users WHERE email IN ('owner@example.com', 'new-owner@example.com') ORDER BY email",
      );
      expect(roles.rows).toEqual([
        { email: 'new-owner@example.com', platform_role: 'owner' },
        { email: 'owner@example.com', platform_role: 'admin' },
      ]);
      // The previous owner's sessions ended with the handover.
      const me = await call(t.app, { method: 'GET', url: '/v1/admin/me', cookie: ownerCookie });
      expect(me.statusCode).toBe(401);
    });

    it('expired links do not work', async () => {
      const link = await setup.createLink({
        purpose: 'staff_invite',
        email: 'late@example.com',
        role: 'support',
      });
      await t.ownerPool.query(
        "UPDATE identity.account_setup_tokens SET expires_at = now() - interval '1 second' WHERE id = $1",
        [link.id],
      );
      const r = await call(t.app, {
        method: 'POST',
        url: '/v1/admin/setup/inspect',
        body: { token: link.token },
      });
      expect(r.json()).toMatchObject({ code: 'SETUP_LINK_INVALID' });
    });
  });

  it('locks an account for 15 minutes after 5 failed sign-ins', async () => {
    const admin = await signInAdmin(t.app, 'support');
    await resetStep(admin.userId);
    for (let i = 0; i < 5; i += 1) {
      const r = await signIn({
        email: admin.email,
        password: 'wrong password!',
        totpCode: '123456',
      });
      expect(r.json()).toMatchObject({ code: 'INVALID_CREDENTIALS' });
    }
    const correct = {
      email: admin.email,
      password: admin.password,
      totpCode: totpCode(admin.totpSecret),
    };
    // Only someone with the right credentials learns that the account is locked.
    expect((await signIn(correct)).json()).toMatchObject({ code: 'ACCOUNT_LOCKED' });
    expect((await signIn({ ...correct, password: 'wrong password!' })).json()).toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });

    await t.ownerPool.query(
      "UPDATE identity.users SET locked_until = now() - interval '1 second' WHERE id = $1",
      [admin.userId],
    );
    expect((await signIn(correct)).statusCode).toBe(200);
  });

  it('ends staff sessions after 30 idle minutes and caps them at 4 hours', async () => {
    const admin = await signInAdmin(t.app, 'support');
    const r = await call(t.app, { method: 'GET', url: '/v1/admin/me', cookie: admin.cookie });
    expect(r.statusCode).toBe(200);
    const session = await t.ownerPool.query(
      "SELECT extract(epoch FROM expires_at - created_at)::int AS ttl FROM identity.sessions WHERE user_id = $1 AND kind = 'admin'",
      [admin.userId],
    );
    expect(session.rows[0].ttl).toBe(4 * 60 * 60);
    await t.ownerPool.query(
      "UPDATE identity.sessions SET last_seen_at = now() - interval '31 minutes' WHERE user_id = $1",
      [admin.userId],
    );
    expect(
      (await call(t.app, { method: 'GET', url: '/v1/admin/me', cookie: admin.cookie })).statusCode,
    ).toBe(401);
  });

  it('asks for the password and code again before dangerous actions', async () => {
    const owner = await t.ownerPool.query<{ id: string }>(
      "SELECT id FROM identity.users WHERE platform_role = 'owner'",
    );
    // Sign in as a fresh admin to create an organization, then use an owner session that
    // re-authenticated more than 10 minutes ago.
    const admin = await signInAdmin(t.app, 'admin');
    const org = await createOrganization(t.app, admin.cookie);
    const { venueId } = await createVenue(t.app, admin.cookie, org.id);
    const staff = await signInAdmin(t.app, 'finance');
    await t.ownerPool.query('UPDATE identity.users SET platform_role = NULL WHERE id = $1', [
      owner.rows[0]!.id,
    ]);
    await t.ownerPool.query("UPDATE identity.users SET platform_role = 'owner' WHERE id = $1", [
      staff.userId,
    ]);
    await t.ownerPool.query(
      "UPDATE identity.sessions SET reauthenticated_at = now() - interval '11 minutes' WHERE user_id = $1",
      [staff.userId],
    );
    const adjust = () =>
      call(t.app, {
        method: 'PUT',
        url: `/v1/admin/venues/${venueId}/commission`,
        cookie: staff.cookie,
        body: { commissionBps: 700, reason: 'Launch offer' },
      });
    expect((await adjust()).json()).toMatchObject({ code: 'REAUTH_REQUIRED' });

    const reauth = (password: string, code: string) =>
      call(t.app, {
        method: 'POST',
        url: '/v1/admin/auth/reauth',
        cookie: staff.cookie,
        body: { password, totpCode: code },
      });
    await resetStep(staff.userId);
    expect((await reauth('wrong password!', totpCode(staff.totpSecret))).statusCode).toBe(401);
    const ok = await reauth(staff.password, totpCode(staff.totpSecret));
    expect(ok.statusCode, ok.body).toBe(200);
    const done = await adjust();
    expect(done.statusCode, done.body).toBe(200);

    // The audit trail has the request, with secrets redacted.
    const rows = await t.ownerPool.query<{ details: { endpoint: string; body: unknown } }>(
      "SELECT details FROM audit.audit_logs WHERE action = 'request.admin' AND actor_user_id = $1 ORDER BY id",
      [staff.userId],
    );
    const endpoints = rows.rows.map((r) => r.details.endpoint);
    expect(endpoints).toContain('POST /v1/admin/auth/reauth');
    expect(endpoints).toContain('PUT /v1/admin/venues/:venueId/commission');
    const reauthRow = rows.rows.find((r) => r.details.endpoint === 'POST /v1/admin/auth/reauth');
    expect(reauthRow!.details.body).toEqual({ password: '[redacted]', totpCode: '[redacted]' });
  });

  it('emails the owner on every sign-in and staff on a new device', async () => {
    const dispatcher = t.app.get(OutboxDispatcher);
    const admin = await signInAdmin(t.app, 'support');
    await resetStep(admin.userId);
    const first = await signIn({
      email: admin.email,
      password: admin.password,
      totpCode: totpCode(admin.totpSecret),
    });
    const device = sessionCookie(first, 'js_admin_device');
    await resetStep(admin.userId);
    const second = await signIn(
      { email: admin.email, password: admin.password, totpCode: totpCode(admin.totpSecret) },
      device,
    );
    expect(second.cookies.find((c) => c.name === 'js_admin_device')).toBeUndefined();

    while ((await dispatcher.dispatchOnce()) > 0) {
      // drain
    }
    const sent = await t.ownerPool.query<{ template: string }>(
      "SELECT template FROM notification.deliveries WHERE channel = 'email' AND recipient = $1",
      [admin.email],
    );
    // signInAdmin + first sign-in were new devices; the second came from a known browser.
    expect(sent.rows.map((r) => r.template)).toEqual(['staffNewDevice', 'staffNewDevice']);
  });
});
