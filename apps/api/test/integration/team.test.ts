import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { totpCode } from '../../src/platform/security/totp.js';
import { call, createTestApp, signInAdmin, type TestApp } from '../support/app.js';

/** The owner's admin team (docs/rbac-plan.md §8). */
describe('admin team', () => {
  let t: TestApp;
  let owner: Awaited<ReturnType<typeof signInAdmin>>;

  beforeAll(async () => {
    t = await createTestApp({ RATE_LIMIT_SCALE: '50' });
    owner = await signInAdmin(t.app, 'owner');
  });
  afterAll(async () => {
    await t?.close();
  });

  const as = (
    cookie: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    url: string,
    body?: unknown,
  ) => call(t.app, { method, url, cookie, ...(body !== undefined ? { body } : {}) });

  it('only the owner sees and manages the team', async () => {
    const admin = await signInAdmin(t.app, 'admin');
    expect((await as(admin.cookie, 'GET', '/v1/admin/team')).statusCode).toBe(403);
    expect(
      (
        await as(admin.cookie, 'POST', '/v1/admin/team/invitations', {
          email: 'a@example.com',
          role: 'admin',
        })
      ).statusCode,
    ).toBe(403);
    const team = await as(owner.cookie, 'GET', '/v1/admin/team');
    expect(team.statusCode).toBe(200);
    const emails = (team.json() as { members: Array<{ email: string }> }).members.map(
      (m) => m.email,
    );
    expect(emails).toContain(owner.email);
    expect(emails).toContain(admin.email);
  });

  it('invites a staff member who then sets up their own account', async () => {
    const invite = await as(owner.cookie, 'POST', '/v1/admin/team/invitations', {
      email: 'Support.Person@example.com',
      displayName: 'Support Person',
      role: 'support',
    });
    expect(invite.statusCode, invite.body).toBe(201);
    const { token, invitation } = invite.json() as { token: string; invitation: { id: string } };
    const pending = (await as(owner.cookie, 'GET', '/v1/admin/team')).json() as {
      invitations: Array<{ id: string }>;
    };
    expect(pending.invitations.map((i) => i.id)).toContain(invitation.id);

    const { totpSecret } = (
      await call(t.app, { method: 'POST', url: '/v1/admin/setup/inspect', body: { token } })
    ).json() as { totpSecret: string };
    const done = await call(t.app, {
      method: 'POST',
      url: '/v1/admin/setup/complete',
      body: {
        token,
        displayName: 'Support Person',
        password: 'support long password',
        totpCode: totpCode(totpSecret),
      },
    });
    expect(done.statusCode, done.body).toBe(200);
    expect(done.json()).toMatchObject({
      platformRole: 'support',
      email: 'support.person@example.com',
    });

    // Inviting an existing staff member again is refused.
    const again = await as(owner.cookie, 'POST', '/v1/admin/team/invitations', {
      email: 'support.person@example.com',
      role: 'admin',
    });
    expect(again.json()).toMatchObject({ code: 'ALREADY_MEMBER' });
  });

  it('cancels a pending invitation', async () => {
    const invite = await as(owner.cookie, 'POST', '/v1/admin/team/invitations', {
      email: 'finance@example.com',
      role: 'finance',
    });
    const { token, invitation } = invite.json() as { token: string; invitation: { id: string } };
    expect(
      (await as(owner.cookie, 'DELETE', `/v1/admin/team/invitations/${invitation.id}`)).statusCode,
    ).toBe(200);
    const inspect = await call(t.app, {
      method: 'POST',
      url: '/v1/admin/setup/inspect',
      body: { token },
    });
    expect(inspect.json()).toMatchObject({ code: 'SETUP_LINK_INVALID' });
  });

  it('changes roles and removes staff immediately, never the owner or oneself', async () => {
    const staff = await signInAdmin(t.app, 'support');
    const changed = await as(owner.cookie, 'PUT', `/v1/admin/team/${staff.userId}/role`, {
      role: 'finance',
    });
    expect(changed.statusCode, changed.body).toBe(200);
    const me = await as(staff.cookie, 'GET', '/v1/admin/me');
    expect(me.json()).toMatchObject({ platformRole: 'finance' });

    expect(
      (await as(owner.cookie, 'PUT', `/v1/admin/team/${owner.userId}/role`, { role: 'admin' }))
        .statusCode,
    ).toBe(403);
    expect((await as(owner.cookie, 'DELETE', `/v1/admin/team/${owner.userId}`)).statusCode).toBe(
      403,
    );
    expect(
      (await as(owner.cookie, 'PUT', `/v1/admin/team/${owner.userId}/role`, { role: 'owner' }))
        .statusCode,
    ).toBe(400);

    expect((await as(owner.cookie, 'DELETE', `/v1/admin/team/${staff.userId}`)).statusCode).toBe(
      200,
    );
    expect((await as(staff.cookie, 'GET', '/v1/admin/me')).statusCode).toBe(401);
    const audit = await t.ownerPool.query<{ action: string }>(
      "SELECT action FROM audit.audit_logs WHERE target_id = $1 AND action LIKE 'admin.%' ORDER BY id",
      [staff.userId],
    );
    expect(audit.rows.map((r) => r.action)).toEqual(
      expect.arrayContaining(['admin.role_changed', 'admin.removed']),
    );
  });
});
