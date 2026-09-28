import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ReleansOtpSender } from '../../src/modules/identity/application/releans-otp-sender.js';
import { ReleansNotificationChannel } from '../../src/modules/notifications/application/channels.js';
import {
  maskPhone,
  ReleansClient,
  SmsDeliveryError,
  toGatewayNumber,
} from '../../src/platform/sms/releans.js';
import { FakeReleans } from '../support/fake-releans.js';

const fake = new FakeReleans();
const client = () =>
  new ReleansClient({
    apiKey: 'test-key-123',
    senderId: 'Jorena',
    baseUrl: fake.baseUrl,
    timeoutMs: 300,
  });

beforeAll(() => fake.start());
afterAll(() => fake.stop());
beforeEach(() => {
  fake.requests.length = 0;
  fake.script.length = 0;
});

describe('ReleansClient', () => {
  it('posts the sender, digits-only number and text with the bearer key', async () => {
    await client().send('+962791234567', 'مرحبا hello');
    expect(fake.requests).toEqual([
      {
        method: 'POST',
        url: '/v2/message',
        authorization: 'Bearer test-key-123',
        form: { senderId: 'Jorena', mobileNumber: '962791234567', message: 'مرحبا hello' },
      },
    ]);
  });

  it('classifies failures: auth and bad requests are final, 429/5xx/timeouts are retryable', async () => {
    const cases: Array<[number, boolean]> = [
      [401, false],
      [403, false],
      [422, false],
      [429, true],
      [500, true],
      [503, true],
    ];
    for (const [status, retryable] of cases) {
      fake.script.push({ status, body: { message: 'nope' } });
      await expect(client().send('+962791234567', 'x')).rejects.toMatchObject({
        name: 'SmsDeliveryError',
        retryable,
      });
    }
    fake.script.push({ status: 201, body: {}, delayMs: 1000 });
    await expect(client().send('+962791234567', 'x')).rejects.toMatchObject({ retryable: true });
  });

  it('treats an error status inside a 200 body as a failure', async () => {
    fake.script.push({ status: 200, body: { status: 400, message: 'Invalid sender' } });
    await expect(client().send('+962791234567', 'x')).rejects.toMatchObject({ retryable: false });
    fake.script.push({ status: 200, body: { status: 201 } });
    await expect(client().send('+962791234567', 'x')).resolves.toBeUndefined();
  });

  it('reports an unreachable gateway as retryable', async () => {
    const dead = new ReleansClient({
      apiKey: 'test-key-123',
      senderId: 'Jorena',
      baseUrl: 'http://127.0.0.1:1/v2',
      timeoutMs: 300,
    });
    await expect(dead.send('+962791234567', 'x')).rejects.toMatchObject({ retryable: true });
  });

  it('never puts the message text, key or full number in an error', async () => {
    fake.script.push({ status: 500, body: { echoed: 'CODE 123456' } });
    const error = await client()
      .send('+962791234567', 'code 123456')
      .catch((e: unknown) => e as Error);
    expect(error).toBeInstanceOf(SmsDeliveryError);
    const message = error instanceof Error ? error.message : '';
    for (const secret of ['123456', 'test-key-123', '962791234567']) {
      expect(message).not.toContain(secret);
    }
  });

  it('rejects malformed numbers without calling the gateway', async () => {
    await expect(client().send('abc', 'x')).rejects.toMatchObject({ retryable: false });
    expect(fake.requests).toHaveLength(0);
    expect(toGatewayNumber('+962 79 123 4567')).toBe('962791234567');
    expect(maskPhone('+962791234567')).toBe('+9627…67');
  });
});

describe('Releans adapters', () => {
  it('OTP sender: Arabic and English messages carry the code and brand, and stay off the log', async () => {
    const sender = new ReleansOtpSender(client());
    await sender.send('+962791234567', '482913', 'ar');
    await sender.send('+962791234567', '482913', 'en');
    const [ar, en] = fake.requests.map((r) => r.form.message!);
    expect(ar).toContain('482913');
    expect(ar).toContain('جورينا');
    expect(en).toContain('482913');
    expect(en).toContain('Jorena');
  });

  it('OTP sender: surfaces gateway failure to the caller', async () => {
    fake.script.push({ status: 503 });
    await expect(
      new ReleansOtpSender(client()).send('+962791234567', '111111', 'en'),
    ).rejects.toBeInstanceOf(SmsDeliveryError);
  });

  it('notification channel: sends the body as is and is named sms', async () => {
    const channel = new ReleansNotificationChannel(client());
    expect(channel.name).toBe('sms');
    await channel.send('+962791234567', 'Booking confirmed');
    expect(fake.requests[0]!.form.message).toBe('Booking confirmed');
  });
});
