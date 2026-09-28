import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  call,
  createTestApp,
  randomIp,
  randomPhone,
  resetRateLimits,
  type TestApp,
} from '../support/app.js';
import { FakeReleans } from '../support/fake-releans.js';

/** Real sign-in through the Releans adapter, against the fake gateway (ADR-0019). */
describe('OTP by SMS (Releans, fake gateway)', () => {
  const fake = new FakeReleans();
  let t: TestApp;

  beforeAll(async () => {
    await fake.start();
    t = await createTestApp({
      OTP_CHANNEL: 'releans',
      RELEANS_API_KEY: 'sandbox-key-123456',
      RELEANS_SENDER_ID: 'Jorena',
      RELEANS_BASE_URL: fake.baseUrl,
    });
  });
  afterAll(async () => {
    await t?.close();
    await fake.stop();
  });

  const request = (phone: string, ip = randomIp()) =>
    call(t.app, { method: 'POST', url: '/v1/auth/otp/request', body: { phone }, ip });

  it('sends the code by SMS, signs in with it, and exposes no on-screen code', async () => {
    const phone = randomPhone();
    const ip = randomIp();
    const r = await request(phone, ip);
    expect(r.statusCode, r.body).toBe(200);
    expect(Object.keys(r.json() as object).sort()).toEqual(['expiresInSeconds', 'phone']);

    expect(fake.requests).toHaveLength(1);
    const sms = fake.requests[0]!;
    expect(sms.authorization).toBe('Bearer sandbox-key-123456');
    expect(sms.form.senderId).toBe('Jorena');
    expect(sms.form.mobileNumber).toBe(phone.replace('+', ''));
    const code = /\d{6}/.exec(sms.form.message!)![0];

    const dev = await call(t.app, {
      method: 'GET',
      url: `/v1/dev/otp?phone=${encodeURIComponent(phone)}`,
      ip,
    });
    expect(dev.statusCode).toBe(404);

    const wrong = await call(t.app, {
      method: 'POST',
      url: '/v1/auth/otp/verify',
      body: { phone, code: code === '000000' ? '111111' : '000000' },
      ip,
    });
    expect(wrong.statusCode).toBe(400);
    const ok = await call(t.app, {
      method: 'POST',
      url: '/v1/auth/otp/verify',
      body: { phone, code },
      ip,
    });
    expect(ok.statusCode, ok.body).toBe(200);
  });

  it('answers 503 (and does not leak the code) when the gateway is down, and recovers', async () => {
    const phone = randomPhone();
    fake.script.push({ status: 500 });
    const down = await request(phone);
    expect(down.statusCode).toBe(503);
    expect(down.json()).toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
    expect(down.json()).toEqual({
      type: 'about:blank',
      title: 'SERVICE_UNAVAILABLE',
      status: 503,
      code: 'SERVICE_UNAVAILABLE',
    });
    await resetRateLimits(t.app, phone);

    const again = await request(phone);
    expect(again.statusCode).toBe(200);
  });

  it('a wrong key or unapproved sender is a 503 for the player, never a 500', async () => {
    fake.script.push({ status: 401, body: { message: 'Unauthorized' } });
    const r = await request(randomPhone());
    expect(r.statusCode).toBe(503);
  });
});
