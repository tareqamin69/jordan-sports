import { Inject, Injectable } from '@nestjs/common';
import sharp, { type OutputInfo } from 'sharp';
import type { Db } from '../../../platform/database/database.js';
import { DATABASE } from '../../../platform/database/database.module.js';
import { uuidv7 } from '../../../platform/database/ids.js';
import { AppError, Errors } from '../../../platform/http/errors.js';
import {
  blurDataUrl,
  deleteWithVariants,
  readVariant,
  type MediaWidth,
} from '../../../platform/storage/image-variants.js';
import { MEDIA_STORAGE, type MediaStorage } from '../../../platform/storage/media-storage.js';
import { AuditService } from '../../audit/index.js';
import type { Actor } from './venues.service.js';

export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_DIMENSION = 2000;
const MAX_PHOTOS_PER_VENUE = 20;

export interface MediaRef {
  id: string;
  url: string;
  width: number;
  height: number;
  /** Tiny blurred preview (data URL) shown while the photo loads. */
  blur: string | null;
}

export function mediaUrl(id: string): string {
  return `/v1/media/${id}`;
}

@Injectable()
export class MediaService {
  constructor(
    @Inject(DATABASE) private readonly db: Db,
    @Inject(MEDIA_STORAGE) private readonly storage: MediaStorage,
    private readonly audit: AuditService,
  ) {}

  /** Which venue a photo belongs to (for an ownership check before an owner-scoped read/delete). */
  async venueIdOf(mediaId: string): Promise<string> {
    const row = await this.db
      .selectFrom('venue.media')
      .select('venue_id')
      .where('id', '=', mediaId)
      .executeTakeFirst();
    if (!row) throw Errors.notFound();
    return row.venue_id;
  }

  async forVenue(venueId: string): Promise<MediaRef[]> {
    const rows = await this.db
      .selectFrom('venue.media')
      .select(['id', 'width', 'height', 'blur', 'storage_key'])
      .where('venue_id', '=', venueId)
      .orderBy('sort_order')
      .orderBy('created_at')
      .execute();
    return Promise.all(
      rows.map(async (r) => ({
        id: r.id,
        url: mediaUrl(r.id),
        width: r.width,
        height: r.height,
        // Photos uploaded before blur-up existed get their preview on first use.
        blur: r.blur ?? (await this.backfillBlur(r.id, r.storage_key)),
      })),
    );
  }

  private async backfillBlur(id: string, key: string): Promise<string | null> {
    try {
      const data = await this.storage.get(key);
      if (!data) return null;
      const blur = await blurDataUrl(data);
      await this.db.updateTable('venue.media').set({ blur }).where('id', '=', id).execute();
      return blur;
    } catch {
      return null;
    }
  }

  /**
   * Re-encodes the upload to WebP (auto-rotated, at most 2000 px). Re-encoding validates that the
   * file really is an image and strips all metadata, including GPS location (§S).
   */
  async upload(
    venueId: string,
    organizationId: string,
    data: Buffer,
    contentType: string,
    actor: Actor,
  ): Promise<void> {
    if (!(ACCEPTED_IMAGE_TYPES as readonly string[]).includes(contentType) || data.length === 0) {
      throw new AppError('UNSUPPORTED_MEDIA', 415);
    }
    const count = await this.db
      .selectFrom('venue.media')
      .select((eb) => eb.fn.countAll<string>().as('n'))
      .where('venue_id', '=', venueId)
      .executeTakeFirstOrThrow();
    if (Number(count.n) >= MAX_PHOTOS_PER_VENUE)
      throw new AppError('VALIDATION_FAILED', 400, 'Too many photos');

    let output: { data: Buffer; info: OutputInfo };
    try {
      output = await sharp(data, { limitInputPixels: 50_000_000, failOn: 'error' })
        .rotate()
        .resize({
          width: MAX_DIMENSION,
          height: MAX_DIMENSION,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality: 80 })
        .toBuffer({ resolveWithObject: true });
    } catch {
      throw new AppError('UNSUPPORTED_MEDIA', 415);
    }

    const id = uuidv7();
    const key = `venues/${venueId}/${id}.webp`;
    await this.storage.put(key, output.data);
    try {
      await this.db.transaction().execute(async (tx) => {
        await tx
          .insertInto('venue.media')
          .values({
            id,
            venue_id: venueId,
            storage_key: key,
            content_type: 'image/webp',
            width: output.info.width,
            height: output.info.height,
            byte_size: output.info.size,
            blur: await blurDataUrl(output.data),
            sort_order: Number(count.n),
            created_by: actor.userId,
          })
          .execute();
        await this.audit.record(
          {
            actorType: actor.type,
            actorUserId: actor.userId,
            action: 'venue.photo_added',
            targetType: 'media',
            targetId: id,
            organizationId,
            meta: actor.meta,
          },
          tx,
        );
      });
    } catch (error) {
      await this.storage.delete(key);
      throw error;
    }
  }

  /** Sets the photo order; the first photo is the cover. `mediaIds` must be exactly the venue's photos. */
  async reorder(venueId: string, mediaIds: readonly string[], actor: Actor): Promise<void> {
    const current = await this.db
      .selectFrom('venue.media as m')
      .innerJoin('venue.venues as v', 'v.id', 'm.venue_id')
      .select(['m.id', 'v.organization_id'])
      .where('m.venue_id', '=', venueId)
      .execute();
    const ids = new Set(current.map((r) => r.id));
    if (
      mediaIds.length !== ids.size ||
      new Set(mediaIds).size !== mediaIds.length ||
      !mediaIds.every((id) => ids.has(id))
    ) {
      throw new AppError('VALIDATION_FAILED', 400, 'The list must contain each photo exactly once');
    }
    await this.db.transaction().execute(async (tx) => {
      for (const [i, id] of mediaIds.entries()) {
        await tx.updateTable('venue.media').set({ sort_order: i }).where('id', '=', id).execute();
      }
      await this.audit.record(
        {
          actorType: actor.type,
          actorUserId: actor.userId,
          action: 'venue.photos_reordered',
          targetType: 'venue',
          targetId: venueId,
          organizationId: current[0]?.organization_id ?? null,
          meta: actor.meta,
        },
        tx,
      );
    });
  }

  async delete(mediaId: string, actor: Actor): Promise<string> {
    const row = await this.db
      .selectFrom('venue.media as m')
      .innerJoin('venue.venues as v', 'v.id', 'm.venue_id')
      .select(['m.storage_key', 'm.venue_id', 'v.organization_id'])
      .where('m.id', '=', mediaId)
      .executeTakeFirst();
    if (!row) throw Errors.notFound();
    await this.db.transaction().execute(async (tx) => {
      await tx.deleteFrom('venue.media').where('id', '=', mediaId).execute();
      await this.audit.record(
        {
          actorType: actor.type,
          actorUserId: actor.userId,
          action: 'venue.photo_removed',
          targetType: 'media',
          targetId: mediaId,
          organizationId: row.organization_id,
          meta: actor.meta,
        },
        tx,
      );
    });
    await deleteWithVariants(this.storage, row.storage_key);
    return row.venue_id;
  }

  /** Public read. Only photos of approved venues are served. */
  async read(mediaId: string, width?: MediaWidth): Promise<Buffer> {
    const row = await this.db
      .selectFrom('venue.media as m')
      .innerJoin('venue.venues as v', 'v.id', 'm.venue_id')
      .select(['m.storage_key', 'v.status'])
      .where('m.id', '=', mediaId)
      .executeTakeFirst();
    if (!row || row.status !== 'approved') throw Errors.notFound();
    const data = await readVariant(this.storage, row.storage_key, width);
    if (!data) throw Errors.notFound();
    return data;
  }

  /** Admin read: photos of any venue (for review before approval). */
  async readAny(mediaId: string, width?: MediaWidth): Promise<Buffer> {
    const row = await this.db
      .selectFrom('venue.media')
      .select('storage_key')
      .where('id', '=', mediaId)
      .executeTakeFirst();
    const data = row ? await readVariant(this.storage, row.storage_key, width) : null;
    if (!data) throw Errors.notFound();
    return data;
  }
}
