import { expect, test } from '@playwright/test';
import { API } from './support';

test.describe('api operational endpoints', () => {
  test('GET /healthz', async ({ request }) => {
    const res = await request.get(`${API}/healthz`);
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });

  test('GET /readyz against the migrated database', async ({ request }) => {
    const res = await request.get(`${API}/readyz`);
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({
      status: 'ready',
      checks: { database: 'ok', migrations: 'ok' },
    });
  });
});
