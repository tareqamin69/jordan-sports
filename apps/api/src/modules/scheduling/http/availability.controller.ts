import { Controller, Get, Param, Query } from '@nestjs/common';
import { getVenueAvailability, type VenueAvailability } from '@jordan-sports/contracts';
import { Public } from '../../../platform/auth/decorators.js';
import { parseInput } from '../../../platform/http/validation.js';
import { AvailabilityService } from '../application/availability.service.js';

@Controller()
export class AvailabilityController {
  constructor(private readonly availability: AvailabilityService) {}

  @Get(getVenueAvailability.path)
  @Public()
  get(@Param() params: unknown, @Query() query: unknown): Promise<VenueAvailability> {
    const { slug } = parseInput(getVenueAvailability.params, params);
    const { date } = parseInput(getVenueAvailability.query, query);
    return this.availability.forVenue(slug, date);
  }
}
