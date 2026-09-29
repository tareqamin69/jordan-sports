import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import { getImageCredits, type ImageCredits } from '@jordan-sports/contracts';
import type { FastifyReply } from 'fastify';
import { z } from 'zod';
import { Public } from '../../../platform/auth/decorators.js';
import { Errors } from '../../../platform/http/errors.js';
import { parseInput } from '../../../platform/http/validation.js';
import { MEDIA_WIDTHS } from '../../../platform/storage/image-variants.js';
import { StockPhotosService } from '../application/stock-photos.service.js';

const widthQuery = z.object({
  w: z.coerce
    .number()
    .int()
    .refine((n): n is (typeof MEDIA_WIDTHS)[number] =>
      (MEDIA_WIDTHS as readonly number[]).includes(n),
    )
    .optional(),
});

@Controller()
@Public()
export class StockPhotosController {
  constructor(private readonly stock: StockPhotosService) {}

  /** Self-hosted illustrative photo (immutable: a replaced photo gets a new id). */
  @Get('/v1/stock/:photoId')
  async photo(@Param() params: unknown, @Query() query: unknown, @Res() reply: FastifyReply) {
    const { photoId } = parseInput(
      z.object({ photoId: z.string().regex(/^pexels-[0-9]+$/) }),
      params,
    );
    const { w } = parseInput(widthQuery, query);
    const data = await this.stock.read(photoId, w);
    if (!data) throw Errors.notFound();
    await reply
      .header('content-type', 'image/webp')
      .header('cache-control', 'public, max-age=31536000, immutable')
      .send(data);
  }

  @Get(getImageCredits.path)
  async credits(): Promise<ImageCredits> {
    return {
      items: (await this.stock.all()).map((p) => ({
        id: p.id,
        sport: p.sport,
        photographer: p.photographer,
        photographerUrl: p.photographerUrl,
        sourceUrl: p.sourceUrl,
        license: p.license,
        licenseUrl: p.licenseUrl,
      })),
    };
  }
}
