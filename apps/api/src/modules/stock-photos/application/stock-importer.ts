import sharp from 'sharp';
import { blurDataUrl, deleteWithVariants } from '../../../platform/storage/image-variants.js';
import type { MediaStorage } from '../../../platform/storage/media-storage.js';
import {
  pickPhotos,
  STOCK_MANIFEST_KEY,
  stockKey,
  stockManifestSchema,
  type PexelsHit,
  type StockManifest,
  type StockPhoto,
} from '../domain/manifest.js';

export interface StockConfig {
  perSport: number;
  sports: Record<string, { queries: string[] }>;
  fallbackQueries: string[];
  exclude: string[];
}

export interface ImportOptions {
  apiKey: string;
  /** Active sport keys from the database: every sport gets photos (config queries or fallback). */
  sportKeys: readonly string[];
  config: StockConfig;
  /** Re-pick photos for every sport (otherwise sports that already have enough are kept). */
  refresh: boolean;
  fetch?: typeof fetch;
  log?: (line: string) => void;
}

const API = 'https://api.pexels.com/v1/search';

export async function readManifest(storage: MediaStorage): Promise<StockManifest | null> {
  const raw = await storage.get(STOCK_MANIFEST_KEY);
  if (!raw) return null;
  const parsed = stockManifestSchema.safeParse(JSON.parse(raw.toString('utf8')));
  return parsed.success ? parsed.data : null;
}

/**
 * Downloads fallback photos from Pexels for every sport, re-encodes them to WebP (at most 2000 px,
 * metadata removed) with a blur preview, and writes `stock/manifest.json` (credits included).
 * Runs on the server (the development sandbox has no internet); safe to re-run.
 */
export async function importStockPhotos(
  storage: MediaStorage,
  options: ImportOptions,
): Promise<StockManifest> {
  const doFetch = options.fetch ?? fetch;
  const log = options.log ?? (() => undefined);
  const previous = (await readManifest(storage))?.photos ?? [];
  const exclude = new Set(options.config.exclude);
  const kept: StockPhoto[] = [];
  const photos: StockPhoto[] = [];

  for (const sport of options.sportKeys) {
    const existing = previous.filter((p) => p.sport === sport && !exclude.has(p.id));
    if (!options.refresh && existing.length >= options.config.perSport) {
      kept.push(...existing);
      continue;
    }
    const queries = options.config.sports[sport]?.queries ?? options.config.fallbackQueries;
    const hits: PexelsHit[] = [];
    for (const query of queries) {
      const url = `${API}?${new URLSearchParams({ query, orientation: 'landscape', size: 'large', per_page: '20' })}`;
      const res = await doFetch(url, { headers: { Authorization: options.apiKey } });
      if (!res.ok) throw new Error(`Pexels search failed (${res.status}) for "${query}"`);
      hits.push(...((await res.json()) as { photos: PexelsHit[] }).photos);
    }
    const taken = new Set([...kept, ...photos].map((p) => p.id));
    const chosen = pickPhotos(hits, options.config.perSport, { exclude, taken });
    if (chosen.length === 0) log(`! ${sport}: no suitable photo found`);
    for (const hit of chosen) {
      const id = `pexels-${hit.id}`;
      const res = await doFetch(`${hit.src.original}?auto=compress&cs=tinysrgb&w=2000`);
      if (!res.ok) throw new Error(`Download failed (${res.status}) for ${id}`);
      const webp = await sharp(Buffer.from(await res.arrayBuffer()))
        .rotate()
        .resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 78 })
        .toBuffer({ resolveWithObject: true });
      await storage.put(stockKey(id), webp.data);
      photos.push({
        id,
        sport,
        width: webp.info.width,
        height: webp.info.height,
        blur: await blurDataUrl(webp.data),
        alt: hit.alt ?? null,
        photographer: hit.photographer,
        photographerUrl: hit.photographer_url,
        sourceUrl: hit.url,
        license: 'Pexels License',
        licenseUrl: 'https://www.pexels.com/license/',
        downloadedAt: new Date().toISOString(),
      });
      log(`+ ${sport}: ${id} by ${hit.photographer}`);
    }
  }

  const manifest: StockManifest = {
    version: 1,
    source: 'pexels',
    generatedAt: new Date().toISOString(),
    photos: [...kept, ...photos],
  };
  // Files no longer listed (excluded or replaced) are removed with their resized copies.
  const listed = new Set(manifest.photos.map((p) => p.id));
  for (const old of previous)
    if (!listed.has(old.id)) await deleteWithVariants(storage, stockKey(old.id));
  await storage.put(STOCK_MANIFEST_KEY, Buffer.from(JSON.stringify(manifest, null, 2)));
  return manifest;
}
