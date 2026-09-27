import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_MIGRATIONS_DIR,
  MigrationError,
  migrationChecksum,
  planMigrations,
  readMigrationFiles,
  type MigrationFile,
} from '../../src/platform/database/migrator.js';
import { createMigrationsDir } from '../support/database.js';

function file(version: number, name: string, sql = `-- ${name}`): MigrationFile {
  return { version, name, sql, checksum: migrationChecksum(sql) };
}

describe('migrationChecksum', () => {
  it('is a stable SHA-256 hex digest', () => {
    expect(migrationChecksum('SELECT 1;')).toMatch(/^[0-9a-f]{64}$/);
    expect(migrationChecksum('SELECT 1;')).toBe(migrationChecksum('SELECT 1;'));
    expect(migrationChecksum('SELECT 1;')).not.toBe(migrationChecksum('SELECT 2;'));
  });

  it('ignores CRLF vs LF line endings', () => {
    expect(migrationChecksum('A;\r\nB;\r\n')).toBe(migrationChecksum('A;\nB;\n'));
  });
});

describe('readMigrationFiles', () => {
  const dirs: Array<{ remove(): Promise<void> }> = [];
  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((d) => d.remove()));
  });

  it('reads .sql files in version order and ignores other files', async () => {
    const d = await createMigrationsDir({
      '0010_later.sql': 'SELECT 10;',
      '0002_second.sql': 'SELECT 2;',
      '0001_first.sql': 'SELECT 1;',
      'README.md': 'notes',
    });
    dirs.push(d);
    const files = await readMigrationFiles(d.dir);
    expect(files.map((f) => f.name)).toEqual([
      '0001_first.sql',
      '0002_second.sql',
      '0010_later.sql',
    ]);
    expect(files.map((f) => f.version)).toEqual([1, 2, 10]);
  });

  it.each(['1_short.sql', '0001-dash.sql', '0001_UPPER.sql', '0001_.sql', 'abcd_name.sql'])(
    'rejects the invalid file name %s',
    async (name) => {
      const d = await createMigrationsDir({ [name]: 'SELECT 1;' });
      dirs.push(d);
      await expect(readMigrationFiles(d.dir)).rejects.toThrow(MigrationError);
    },
  );

  it('rejects duplicate versions', async () => {
    const d = await createMigrationsDir({ '0001_a.sql': 'SELECT 1;', '0001_b.sql': 'SELECT 1;' });
    dirs.push(d);
    await expect(readMigrationFiles(d.dir)).rejects.toThrow(/Duplicate migration version 1/);
  });

  it('accepts the migrations shipped with this build', async () => {
    const files = await readMigrationFiles(DEFAULT_MIGRATIONS_DIR);
    expect(files.length).toBeGreaterThan(0);
    expect(files[0]?.name).toBe('0001_extensions.sql');
  });
});

describe('planMigrations', () => {
  const f1 = file(1, '0001_a.sql');
  const f2 = file(2, '0002_b.sql');
  const f3 = file(3, '0003_c.sql');

  it('treats every file as pending on an empty database', () => {
    const plan = planMigrations([f1, f2], []);
    expect(plan.pending.map((m) => m.name)).toEqual(['0001_a.sql', '0002_b.sql']);
    expect(plan).toMatchObject({ modified: [], outOfOrder: [], unknown: [] });
  });

  it('reports nothing to do when everything is applied', () => {
    const plan = planMigrations([f1, f2], [f1, f2]);
    expect(plan).toEqual({ pending: [], modified: [], outOfOrder: [], unknown: [] });
  });

  it('detects an applied migration whose content changed', () => {
    const edited = file(1, '0001_a.sql', 'SELECT "edited";');
    expect(planMigrations([edited], [f1]).modified).toEqual(['0001_a.sql']);
  });

  it('detects an applied migration that was renamed', () => {
    const renamed = { ...f1, name: '0001_renamed.sql' };
    expect(planMigrations([renamed], [f1]).modified).toEqual(['0001_renamed.sql']);
  });

  it('detects pending migrations numbered below the latest applied one', () => {
    const plan = planMigrations([f1, f2, f3], [f1, f3]);
    expect(plan.pending.map((m) => m.name)).toEqual(['0002_b.sql']);
    expect(plan.outOfOrder).toEqual(['0002_b.sql']);
  });

  it('tolerates applied migrations that are not part of this build', () => {
    const plan = planMigrations([f1], [f1, f2]);
    expect(plan.pending).toEqual([]);
    expect(plan.unknown).toEqual(['0002_b.sql']);
  });
});
