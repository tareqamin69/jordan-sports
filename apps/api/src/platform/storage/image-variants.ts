import sharp from 'sharp';
import type { MediaStorage } from './media-storage.js';

/** Widths served with `?w=` (resized WebP copies); anything else gets the original. */
export const MEDIA_WIDTHS = [320, 640, 960, 1600] as const;
export type MediaWidth = (typeof MEDIA_WIDTHS)[number];

/** `venues/x/abc.webp` → `venues/x/abc-w640.webp` (storage keys allow only `[a-z0-9-]`). */
export function variantKey(key: string, width: MediaWidth): string {
  return key.replace(/\.webp$/, `-w${width}.webp`);
}

/** A ~16 px WebP of the image as a data URL (a few hundred bytes), for blur-up placeholders. */
export async function blurDataUrl(image: Buffer): Promise<string> {
  const tiny = await sharp(image)
    .resize(16, 16, { fit: 'inside' })
    .webp({ quality: 40 })
    .toBuffer();
  return `data:image/webp;base64,${tiny.toString('base64')}`;
}

/**
 * The image at `key`, or a resized copy created on first request and stored next to it. Images
 * are immutable (a changed photo gets a new key), so copies never go stale.
 */
export async function readVariant(
  storage: MediaStorage,
  key: string,
  width: MediaWidth | undefined,
): Promise<Buffer | null> {
  if (!width) return storage.get(key);
  const vKey = variantKey(key, width);
  const cached = await storage.get(vKey);
  if (cached) return cached;
  const original = await storage.get(key);
  if (!original) return null;
  const resized = await sharp(original)
    .resize({ width, withoutEnlargement: true })
    .webp({ quality: width <= 640 ? 72 : 78 })
    .toBuffer();
  await storage.put(vKey, resized);
  return resized;
}

/** Removes an image and all its resized copies. */
export async function deleteWithVariants(storage: MediaStorage, key: string): Promise<void> {
  await storage.delete(key);
  for (const w of MEDIA_WIDTHS) await storage.delete(variantKey(key, w));
}
