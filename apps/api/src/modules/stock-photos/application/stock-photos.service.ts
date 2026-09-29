import { Inject, Injectable } from '@nestjs/common';
import type { Media } from '@jordan-sports/contracts';
import type { AppConfig } from '../../../platform/config/config.js';
import { APP_CONFIG } from '../../../platform/config/config.module.js';
import { readVariant, type MediaWidth } from '../../../platform/storage/image-variants.js';
import {
  FilesystemMediaStorage,
  type MediaStorage,
} from '../../../platform/storage/media-storage.js';
import { stableIndex, stockKey, type StockPhoto } from '../domain/manifest.js';
import { readManifest } from './stock-importer.js';

const CACHE_MS = 60_000;

/** Illustrative sport photos (self-hosted from Pexels) used when a venue has no photos of its own. */
@Injectable()
export class StockPhotosService {
  private readonly storage: MediaStorage;
  private cached: { at: number; photos: StockPhoto[] } | undefined;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.storage = new FilesystemMediaStorage(config.mediaDir);
  }

  async all(): Promise<StockPhoto[]> {
    if (this.cached && Date.now() - this.cached.at < CACHE_MS) return this.cached.photos;
    const photos = (await readManifest(this.storage).catch(() => null))?.photos ?? [];
    this.cached = { at: Date.now(), photos };
    return photos;
  }

  invalidate(): void {
    this.cached = undefined;
  }

  static toMedia(p: StockPhoto): Media {
    return {
      id: p.id,
      url: `/v1/stock/${p.id}`,
      width: p.width,
      height: p.height,
      blur: p.blur,
      stock: { photographer: p.photographer, sourceUrl: p.sourceUrl },
    };
  }

  /** Photos per sport key, in manifest order. */
  async bySport(): Promise<Map<string, Media[]>> {
    const map = new Map<string, Media[]>();
    for (const p of await this.all()) {
      map.set(p.sport, [...(map.get(p.sport) ?? []), StockPhotosService.toMedia(p)]);
    }
    return map;
  }

  /** A stable illustrative cover for a venue without photos, from its first sport that has any. */
  async coverFor(venueId: string, sportKeys: readonly string[]): Promise<Media | null> {
    const bySport = await this.bySport();
    for (const key of sportKeys) {
      const list = bySport.get(key);
      if (list?.length) return list[stableIndex(venueId, list.length)]!;
    }
    return null;
  }

  async read(id: string, width?: MediaWidth): Promise<Buffer | null> {
    if (!(await this.all()).some((p) => p.id === id)) return null;
    return readVariant(this.storage, stockKey(id), width);
  }
}
