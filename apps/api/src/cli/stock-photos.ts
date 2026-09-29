import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import pg from 'pg';
import { loadDotEnv, parseConfig } from '../platform/config/config.js';
import { FilesystemMediaStorage } from '../platform/storage/media-storage.js';
import {
  importStockPhotos,
  readManifest,
  type StockConfig,
} from '../modules/stock-photos/index.js';

/**
 * Downloads illustrative sport photos from Pexels into media storage (docs/image-credits.md).
 * Runs on the server during deploy; needs PEXELS_API_KEY (free at pexels.com/api). Without a key
 * it does nothing (the site then shows the illustrated courts, as before).
 *
 *   node dist/cli/stock-photos.js              # fill sports that have fewer photos than configured
 *   node dist/cli/stock-photos.js --refresh    # pick again for every sport (after editing excludes)
 *   node dist/cli/stock-photos.js --credits    # print the credits JSON (to commit to the repo)
 */
async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      refresh: { type: 'boolean', default: false },
      credits: { type: 'boolean', default: false },
      config: { type: 'string', default: '' },
    },
  });
  loadDotEnv();
  const config = parseConfig(process.env);
  const storage = new FilesystemMediaStorage(config.mediaDir);

  if (values.credits) {
    const manifest = await readManifest(storage);
    console.log(JSON.stringify(manifest?.photos.map(({ blur: _blur, ...p }) => p) ?? [], null, 2));
    return 0;
  }
  const apiKey = process.env.PEXELS_API_KEY?.trim();
  if (!apiKey) {
    console.log('PEXELS_API_KEY is not set: skipping stock photos (illustrations stay in use).');
    return 0;
  }
  const configPath =
    values.config ||
    [
      resolve('infra/stock-photos/sports.json'),
      resolve('../../infra/stock-photos/sports.json'),
    ].find((p) => {
      try {
        readFileSync(p);
        return true;
      } catch {
        return false;
      }
    });
  if (!configPath) throw new Error('infra/stock-photos/sports.json not found');
  const stockConfig = JSON.parse(readFileSync(configPath, 'utf8')) as StockConfig;

  const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 1 });
  try {
    const { rows } = await pool.query<{ key: string }>(
      'SELECT key FROM catalog.sports WHERE active ORDER BY sort_order',
    );
    const manifest = await importStockPhotos(storage, {
      apiKey,
      sportKeys: rows.map((r) => r.key),
      config: stockConfig,
      refresh: values.refresh,
      log: (line) => console.log(line),
    });
    const bySport = new Map<string, number>();
    for (const p of manifest.photos) bySport.set(p.sport, (bySport.get(p.sport) ?? 0) + 1);
    console.log(`Stock photos: ${manifest.photos.length} for ${bySport.size} sports.`);
    return 0;
  } finally {
    await pool.end();
  }
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    // Never block a deploy on photos: log and exit cleanly.
    console.error(
      `Stock photos skipped: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 0;
  },
);
