import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import pg from 'pg';
import { pino } from 'pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHttpApp } from '../../src/http-app.js';
import { parseConfig } from '../../src/platform/config/config.js';
import { createPool } from '../../src/platform/database/database.js';
import { Migrator } from '../../src/platform/database/migrator.js';
import { createTestDatabase, type TestDatabase } from '../support/database.js';

const silent = pino({ level: 'silent' });

async function appFor(databaseUrl: string): Promise<NestFastifyApplication> {
  const config = parseConfig({
    NODE_ENV: 'test',
    DATABASE_URL: databaseUrl,
    DATABASE_POOL_MAX: '2',
  });
  const app = await createHttpApp(config, silent);
  await app.getHttpAdapter().getInstance().ready();
  return app;
}

describe('health endpoints', () => {
  describe('with a migrated database', () => {
    let db: TestDatabase;
    let app: NestFastifyApplication;

    beforeAll(async () => {
      db = await createTestDatabase();
      const pool: pg.Pool = createPool({ connectionString: db.url, max: 1 });
      await new Migrator({ pool }).migrate();
      await pool.end();
      app = await appFor(db.url);
    });

    afterAll(async () => {
      await app?.close();
      await db?.drop();
    });

    it('GET /healthz reports liveness with a server-generated request id', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/healthz',
        headers: { 'x-request-id': 'client-supplied' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ status: 'ok' });
      expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('GET /readyz reports ready', async () => {
      const res = await app.inject({ method: 'GET', url: '/readyz' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ status: 'ready', checks: { database: 'ok', migrations: 'ok' } });
    });

    it('returns 404 for unknown routes', async () => {
      const res = await app.inject({ method: 'GET', url: '/does-not-exist' });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('with pending migrations', () => {
    let db: TestDatabase;
    let app: NestFastifyApplication;

    beforeAll(async () => {
      db = await createTestDatabase();
      app = await appFor(db.url);
    });

    afterAll(async () => {
      await app?.close();
      await db?.drop();
    });

    it('GET /readyz is 503 because migrations are not applied', async () => {
      const res = await app.inject({ method: 'GET', url: '/readyz' });
      expect(res.statusCode).toBe(503);
      expect(res.json()).toEqual({
        status: 'not_ready',
        checks: { database: 'ok', migrations: 'failed' },
      });
    });
  });

  describe('with an unreachable database', () => {
    let app: NestFastifyApplication;

    beforeAll(async () => {
      // Port 1 on localhost: connection is refused immediately.
      app = await appFor('postgres://nobody:nothing@127.0.0.1:1/nowhere');
    });

    afterAll(async () => {
      await app?.close();
    });

    it('GET /healthz stays 200 (liveness does not depend on the database)', async () => {
      const res = await app.inject({ method: 'GET', url: '/healthz' });
      expect(res.statusCode).toBe(200);
    });

    it('GET /readyz is 503 without leaking connection details', async () => {
      const res = await app.inject({ method: 'GET', url: '/readyz' });
      expect(res.statusCode).toBe(503);
      expect(res.json()).toEqual({
        status: 'not_ready',
        checks: { database: 'failed', migrations: 'failed' },
      });
      expect(res.body).not.toContain('127.0.0.1');
    });
  });
});
