import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  ADMIN_ORIGIN,
  call,
  createTestApp,
  randomIp,
  randomPhone,
  sessionCookie,
  signInPlayer,
  resetRateLimits,
  type TestApp,
} from '../support/app.js';

describe('player authentication (phone OTP)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t?.close();
  });

  async function latestCode(phone: string, ip: string): Promise<string> {
    const r = await call(t.app, {
      method: 'GET',
      url: `/v1/dev/otp?phone=${encodeURIComponent(phone)}`,
      ip,
    });
    return (r.json() as { code: string }).code;
  }

  it('rejects invalid phone numbers', async () => {
    for (const phone of ['1234567', '+962612345678', '0791234']) {
      const r = await call(t.app, {
        method: 'POST',
        url: '/v1/auth/otp/request',
        body: { phone },
        ip: randomIp(),
      });
      expect(r.statusCode).toBe(400);
      expect(r.json()).toMatchObject({ code: 'INVALID_PHONE' });
      expect(r.headers['content-type']).toContain('application/problem+json');
    }
  });

  it('accepts local Jordanian formats and normalizes them', async () => {
    await resetRateLimits(t.app, '+962795550101');
    const r = await call(t.app, {
      method: 'POST',
      url: '/v1/auth/otp/request',
      body: { phone: '079 555 0101' },
      ip: randomIp(),
    });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ phone: '+962795550101', expiresInSeconds: 300 });
  });

  it('signs up a new player: code → profile (name + age 16+) → session', async () => {
    const phone = randomPhone();
    const ip = randomIp();
    await call(t.app, { method: 'POST', url: '/v1/auth/otp/request', body: { phone }, ip });
    const verified = await call(t.app, {
      method: 'POST',
      url: '/v1/auth/otp/verify',
      body: { phone, code: await latestCode(phone, ip) },
      ip,
    });
    expect(verified.statusCode).toBe(200);
    const { status, signupToken } = verified.json() as { status: string; signupToken: string };
    expect(status).toBe('profile_required');
    expect(verified.cookies.find((c) => c.name === 'js_session')).toBeUndefined();

    // Age confirmation is mandatory.
    const noAge = await call(t.app, {
      method: 'POST',
      url: '/v1/auth/signup',
      body: {
        signupToken,
        displayName: 'Rami',
        locale: 'ar',
        ageConfirmed: false,
        preferredMode: 'player',
      },
      ip,
    });
    expect(noAge.statusCode).toBe(400);

    const signup = await call(t.app, {
      method: 'POST',
      url: '/v1/auth/signup',
      body: {
        signupToken,
        displayName: 'Rami',
        locale: 'ar',
        ageConfirmed: true,
        preferredMode: 'player',
      },
      ip,
    });
    expect(signup.statusCode).toBe(200);
    const cookie = signup.cookies.find((c) => c.name === 'js_session')!;
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/' });

    const me = await call(t.app, {
      method: 'GET',
      url: '/v1/me',
      cookie: `js_session=${cookie.value}`,
    });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({
      phone,
      displayName: 'Rami',
      locale: 'ar',
      preferredMode: 'player',
      memberships: [],
    });

    // The sign-up token is single-use.
    const again = await call(t.app, {
      method: 'POST',
      url: '/v1/auth/signup',
      body: {
        signupToken,
        displayName: 'Rami',
        locale: 'ar',
        ageConfirmed: true,
        preferredMode: 'player',
      },
      ip,
    });
    expect(again.json()).toMatchObject({ code: 'SIGNUP_TOKEN_INVALID' });
  });

  it('signs an existing player straight in', async () => {
    const { phone } = await signInPlayer(t.app, { name: 'Lina' });
    await resetRateLimits(t.app, phone);
    const ip = randomIp();
    await call(t.app, { method: 'POST', url: '/v1/auth/otp/request', body: { phone }, ip });
    const r = await call(t.app, {
      method: 'POST',
      url: '/v1/auth/otp/verify',
      body: { phone, code: await latestCode(phone, ip) },
      ip,
    });
    expect(r.json()).toMatchObject({ status: 'signed_in', user: { displayName: 'Lina' } });
    expect(sessionCookie(r, 'js_session')).toMatch(/^js_session=/);
  });

  it('locks a code after 5 wrong attempts, even if the right code is sent afterwards', async () => {
    const phone = randomPhone();
    const ip = randomIp();
    await call(t.app, { method: 'POST', url: '/v1/auth/otp/request', body: { phone }, ip });
    const right = await latestCode(phone, ip);
    const wrong = right === '000000' ? '111111' : '000000';
    const codes: string[] = [];
    for (let i = 0; i < 5; i++) {
      const r = await call(t.app, {
        method: 'POST',
        url: '/v1/auth/otp/verify',
        body: { phone, code: wrong },
        ip,
      });
      codes.push((r.json() as { code: string }).code);
    }
    expect(codes).toEqual([
      'OTP_INVALID',
      'OTP_INVALID',
      'OTP_INVALID',
      'OTP_INVALID',
      'OTP_TOO_MANY_ATTEMPTS',
    ]);
    const r = await call(t.app, {
      method: 'POST',
      url: '/v1/auth/otp/verify',
      body: { phone, code: right },
      ip,
    });
    expect(r.json()).toMatchObject({ code: 'OTP_TOO_MANY_ATTEMPTS' });
  });

  it('rejects expired codes', async () => {
    const phone = randomPhone();
    const ip = randomIp();
    await call(t.app, { method: 'POST', url: '/v1/auth/otp/request', body: { phone }, ip });
    await t.ownerPool.query(
      `UPDATE identity.otp_challenges SET expires_at = now() - interval '1 second' WHERE phone = $1`,
      [phone],
    );
    const r = await call(t.app, {
      method: 'POST',
      url: '/v1/auth/otp/verify',
      body: { phone, code: await latestCode(phone, ip) },
      ip,
    });
    expect(r.json()).toMatchObject({ code: 'OTP_EXPIRED' });
  });

  it('rate-limits repeated code requests for the same phone', async () => {
    const phone = randomPhone();
    const first = await call(t.app, {
      method: 'POST',
      url: '/v1/auth/otp/request',
      body: { phone },
      ip: randomIp(),
    });
    const second = await call(t.app, {
      method: 'POST',
      url: '/v1/auth/otp/request',
      body: { phone },
      ip: randomIp(),
    });
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(429);
    expect(second.json()).toMatchObject({ code: 'RATE_LIMITED' });
    expect(Number(second.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('never stores codes or session tokens in clear text', async () => {
    const { cookie, phone } = await signInPlayer(t.app);
    const token = cookie.split('=')[1]!;
    const sessions = await t.ownerPool.query('SELECT token_hash FROM identity.sessions');
    expect(JSON.stringify(sessions.rows)).not.toContain(token);
    const challenges = await t.ownerPool.query(
      'SELECT code_hash FROM identity.otp_challenges WHERE phone = $1',
      [phone],
    );
    for (const row of challenges.rows as Array<{ code_hash: string }>)
      expect(row.code_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('signs out by revoking the session', async () => {
    const { cookie } = await signInPlayer(t.app);
    expect((await call(t.app, { method: 'GET', url: '/v1/me', cookie })).statusCode).toBe(200);
    const out = await call(t.app, { method: 'POST', url: '/v1/auth/sign-out', cookie });
    expect(out.statusCode).toBe(200);
    expect((await call(t.app, { method: 'GET', url: '/v1/me', cookie })).statusCode).toBe(401);
  });

  it('updates the profile', async () => {
    const { cookie } = await signInPlayer(t.app);
    const r = await call(t.app, {
      method: 'PATCH',
      url: '/v1/me',
      cookie,
      body: { displayName: 'New Name', locale: 'en' },
    });
    expect(r.json()).toMatchObject({ displayName: 'New Name', locale: 'en' });
  });

  it('requires authentication for private routes', async () => {
    const r = await call(t.app, { method: 'GET', url: '/v1/me' });
    expect(r.statusCode).toBe(401);
    expect(r.json()).toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  describe('CSRF origin check', () => {
    it('rejects state-changing requests without an Origin header', async () => {
      const r = await call(t.app, {
        method: 'POST',
        url: '/v1/auth/otp/request',
        body: { phone: randomPhone() },
        origin: null,
      });
      expect(r.statusCode).toBe(403);
      expect(r.json()).toMatchObject({ code: 'ORIGIN_NOT_ALLOWED' });
    });

    it('rejects foreign origins, including the admin origin on web routes', async () => {
      for (const origin of ['https://evil.example', ADMIN_ORIGIN]) {
        const r = await call(t.app, {
          method: 'POST',
          url: '/v1/auth/otp/request',
          body: { phone: randomPhone() },
          origin,
        });
        expect(r.statusCode).toBe(403);
      }
    });
  });

  it('publishes an OpenAPI document of the endpoints', async () => {
    const r = await call(t.app, { method: 'GET', url: '/v1/openapi.json' });
    expect(r.statusCode).toBe(200);
    const doc = r.json() as { openapi: string; paths: Record<string, unknown> };
    expect(doc.openapi).toBe('3.1.0');
    expect(Object.keys(doc.paths)).toEqual(
      expect.arrayContaining(['/v1/auth/otp/request', '/v1/me']),
    );
  });
});
