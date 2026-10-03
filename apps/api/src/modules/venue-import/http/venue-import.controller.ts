import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import {
  adminImportVenueFromMap,
  importMyVenueFromMap,
  type VenueImport,
} from '@jordan-sports/contracts';
import type { Actor } from '../../../platform/auth/actor.js';
import { AdminAuth, CurrentActor, UserAuth } from '../../../platform/auth/decorators.js';
import { parseInput } from '../../../platform/http/validation.js';
import { VenueImportService } from '../application/venue-import.service.js';

/** Pre-fill a new venue from a Google Maps link: venue owners (wizard) and staff (console). */
@Controller()
export class VenueImportController {
  constructor(private readonly imports: VenueImportService) {}

  @Post(importMyVenueFromMap.path)
  @HttpCode(200)
  @UserAuth()
  forOwner(@Body() body: unknown, @CurrentActor() actor: Actor): Promise<VenueImport> {
    const { url } = parseInput(importMyVenueFromMap.body, body);
    return this.imports.import(url, `user:${actor.userId}`);
  }

  @Post(adminImportVenueFromMap.path)
  @HttpCode(200)
  @AdminAuth()
  forAdmin(@Body() body: unknown, @CurrentActor() actor: Actor): Promise<VenueImport> {
    const { url } = parseInput(adminImportVenueFromMap.body, body);
    return this.imports.import(url, `admin:${actor.userId}`);
  }
}
