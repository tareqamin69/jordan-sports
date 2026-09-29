import { z } from 'zod';

/** One self-hosted stock photo (downloaded from Pexels, re-encoded to WebP on our server). */
export const stockPhotoSchema = z.object({
  /** `pexels-<id>`; also the storage file name (`stock/<id>.webp`). */
  id: z.string().regex(/^pexels-[0-9]+$/),
  sport: z.string().regex(/^[a-z0-9_]+$/),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  blur: z.string().nullable(),
  alt: z.string().nullable(),
  photographer: z.string(),
  photographerUrl: z.string().url(),
  sourceUrl: z.string().url(),
  license: z.literal('Pexels License'),
  licenseUrl: z.literal('https://www.pexels.com/license/'),
  downloadedAt: z.string(),
});
export type StockPhoto = z.infer<typeof stockPhotoSchema>;

export const stockManifestSchema = z.object({
  version: z.literal(1),
  source: z.literal('pexels'),
  generatedAt: z.string(),
  photos: z.array(stockPhotoSchema),
});
export type StockManifest = z.infer<typeof stockManifestSchema>;

export const STOCK_MANIFEST_KEY = 'stock/manifest.json';
export const stockKey = (id: string) => `stock/${id}.webp`;

/** A search hit from the Pexels API (only the fields we use). */
export interface PexelsHit {
  id: number;
  width: number;
  height: number;
  url: string;
  alt?: string | null;
  photographer: string;
  photographer_url: string;
  src: { original: string };
}

/**
 * Chooses up to `count` photos from search hits: landscape, large enough for a hero, not excluded
 * and not already used for another sport; keeps the search engine's (relevance) order.
 */
export function pickPhotos(
  hits: readonly PexelsHit[],
  count: number,
  options: { exclude: ReadonlySet<string>; taken: ReadonlySet<string>; minWidth?: number },
): PexelsHit[] {
  const minWidth = options.minWidth ?? 1600;
  const out: PexelsHit[] = [];
  const seen = new Set<number>();
  for (const hit of hits) {
    const id = `pexels-${hit.id}`;
    if (seen.has(hit.id) || options.exclude.has(id) || options.taken.has(id)) continue;
    if (hit.width < minWidth || hit.width < hit.height * 1.2) continue;
    seen.add(hit.id);
    out.push(hit);
    if (out.length === count) break;
  }
  return out;
}

/** A stable choice among a sport's photos for a venue (the same venue always shows the same one). */
export function stableIndex(seed: string, length: number): number {
  let hash = 0;
  for (const c of seed) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
  return length > 0 ? hash % length : 0;
}
