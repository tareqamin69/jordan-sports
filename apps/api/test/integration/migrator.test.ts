import pg from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPool } from '../../src/platform/database/database.js';
import { MigrationError, Migrator } from '../../src/platform/database/migrator.js';
import { createMigrationsDir, createTestDatabase, type TestDatabase } from '../support/database.js';

describe('Migrator (real PostgreSQL)', () => {
  let db: TestDatabase;
  let pool: pg.Pool;
  const cleanups: Array<() => Promise<void>> = [];

  beforeEach(async () => {
    db = await createTestDatabase();
    pool = createPool({ connectionString: db.url, max: 10 });
  });

  afterEach(async () => {
    await Promise.all(cleanups.splice(0).map((fn) => fn()));
    await pool.end();
    await db.drop();
  });

  async function tempDir(files: Record<string, string>) {
    const d = await createMigrationsDir(files);
    cleanups.push(d.remove);
    return d;
  }

  describe('shipped migrations', () => {
    it('apply cleanly to an empty database and enable the required extensions', async () => {
      const migrator = new Migrator({ pool });
      expect(await migrator.migrate()).toEqual(
        expect.arrayContaining(['0001_extensions.sql', '0002_identity_tenancy_audit.sql']),
      );

      const { rows } = await pool.query<{ extname: string }>(
        'SELECT extname FROM pg_extension ORDER BY extname',
      );
      expect(rows.map((r) => r.extname)).toEqual(
        expect.arrayContaining(['btree_gist', 'citext', 'pg_trgm', 'postgis']),
      );
      expect(await migrator.plan()).toEqual({
        pending: [],
        modified: [],
        outOfOrder: [],
        unknown: [],
      });
    });

    it('are idempotent: a second run applies nothing', async () => {
      const migrator = new Migrator({ pool });
      await migrator.migrate();
      expect(await migrator.migrate()).toEqual([]);
    });

    it('support the occupancy exclusion-constraint pattern (ADR-0004)', async () => {
      await new Migrator({ pool }).migrate();
      // Temp tables are per connection, so pin one client for the whole check.
      const client = await pool.connect();
      try {
        await client.query(`
          CREATE TEMP TABLE probe (
            unit_id integer NOT NULL,
            during  tstzrange NOT NULL,
            active  boolean NOT NULL DEFAULT true,
            EXCLUDE USING gist (unit_id WITH =, during WITH &&) WHERE (active)
          )`);
        const insert = (unit: number, from: string, to: string, active = true) =>
          client.query("INSERT INTO probe VALUES ($1, tstzrange($2, $3, '[)'), $4)", [
            unit,
            from,
            to,
            active,
          ]);
        await insert(1, '2026-10-02T18:00:00+03:00', '2026-10-02T19:00:00+03:00');
        // Adjacent ranges do not overlap with [) bounds.
        await insert(1, '2026-10-02T19:00:00+03:00', '2026-10-02T20:00:00+03:00');
        // Another unit may use the same time.
        await insert(2, '2026-10-02T18:30:00+03:00', '2026-10-02T19:30:00+03:00');
        // Inactive rows (released holds, cancelled bookings) never block.
        await insert(1, '2026-10-02T18:15:00+03:00', '2026-10-02T18:45:00+03:00', false);
        await expect(
          insert(1, '2026-10-02T18:30:00+03:00', '2026-10-02T19:30:00+03:00'),
        ).rejects.toMatchObject({ code: '23P01' });
      } finally {
        client.release();
      }
    });

    it('provide working PostGIS distance calculations', async () => {
      await new Migrator({ pool }).migrate();
      // Two points ~1 km apart in Amman (approximate coordinates, test data only).
      const { rows } = await pool.query<{ metres: number }>(`
        SELECT ST_Distance(
          ST_SetSRID(ST_MakePoint(35.9106, 31.9539), 4326)::geography,
          ST_SetSRID(ST_MakePoint(35.9106, 31.9629), 4326)::geography
        ) AS metres`);
      expect(rows[0]!.metres).toBeGreaterThan(900);
      expect(rows[0]!.metres).toBeLessThan(1100);
    });
  });

  describe('runner guarantees', () => {
    it('refuses to run when an applied migration was modified', async () => {
      const d = await tempDir({ '0001_create.sql': 'CREATE TABLE t1 (id int);' });
      const migrator = new Migrator({ pool, migrationsDir: d.dir });
      await migrator.migrate();

      await d.write('0001_create.sql', 'CREATE TABLE t1 (id bigint);');
      await expect(migrator.migrate()).rejects.toThrow(/were modified: 0001_create.sql/);
      expect((await migrator.plan()).modified).toEqual(['0001_create.sql']);
    });

    it('rolls back a failing migration completely and does not record it', async () => {
      const d = await tempDir({
        '0001_ok.sql': 'CREATE TABLE t1 (id int);',
        '0002_broken.sql': 'CREATE TABLE t2 (id int);\nSELECT * FROM table_that_does_not_exist;',
      });
      const migrator = new Migrator({ pool, migrationsDir: d.dir });
      await expect(migrator.migrate()).rejects.toThrow(MigrationError);
      await expect(migrator.migrate()).rejects.toThrow(/0002_broken.sql failed/);

      const { rows } = await pool.query<{ t1: string | null; t2: string | null }>(
        `SELECT to_regclass('public.t1')::text AS t1, to_regclass('public.t2')::text AS t2`,
      );
      expect(rows[0]).toEqual({ t1: 't1', t2: null });
      const plan = await migrator.plan();
      expect(plan.pending.map((m) => m.name)).toEqual(['0002_broken.sql']);
    });

    it('refuses pending migrations numbered below the latest applied one', async () => {
      const d = await tempDir({
        '0001_a.sql': 'CREATE TABLE a (id int);',
        '0003_c.sql': 'CREATE TABLE c (id int);',
      });
      const migrator = new Migrator({ pool, migrationsDir: d.dir });
      await migrator.migrate();
      await d.write('0002_b.sql', 'CREATE TABLE b (id int);');
      await expect(migrator.migrate()).rejects.toThrow(/numbered below the latest applied/);
    });

    it('serializes concurrent runs so each migration is applied exactly once', async () => {
      const d = await tempDir({
        '0001_counter.sql': 'CREATE TABLE counter (n int NOT NULL);',
        '0002_increment.sql': 'INSERT INTO counter VALUES (1);',
      });
      const runs = await Promise.all(
        Array.from({ length: 6 }, () => new Migrator({ pool, migrationsDir: d.dir }).migrate()),
      );
      expect(runs.flat().sort()).toEqual(['0001_counter.sql', '0002_increment.sql']);
      const { rows } = await pool.query<{ count: string }>('SELECT count(*) FROM counter');
      expect(rows[0]!.count).toBe('1');
    });
  });
});
