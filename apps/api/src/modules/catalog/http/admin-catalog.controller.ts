import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import {
  adminCreateArea,
  adminCreateGovernorate,
  adminCreateSport,
  adminListSports,
  adminUpdateArea,
  adminUpdateGovernorate,
  adminUpdateSport,
  type Catalog,
} from '@jordan-sports/contracts';
import { AdminAuth } from '../../../platform/auth/decorators.js';
import { parseInput } from '../../../platform/http/validation.js';
import { CatalogService } from '../application/catalog.service.js';

/** Admin geography management (docs/plans/jordan-wide-cliq-marketplace.md §1): add, rename and
 * reorder governorates and areas without a code release. Never deletes — a venue may reference
 * an area. */
@Controller()
@AdminAuth()
export class AdminCatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Post(adminCreateGovernorate.path)
  createGovernorate(@Body() body: unknown): Promise<Catalog> {
    return this.catalog.createGovernorate(parseInput(adminCreateGovernorate.body, body));
  }

  @Patch(adminUpdateGovernorate.path)
  updateGovernorate(@Param() params: unknown, @Body() body: unknown): Promise<Catalog> {
    const { governorateId } = parseInput(adminUpdateGovernorate.params, params);
    return this.catalog.updateGovernorate(
      governorateId,
      parseInput(adminUpdateGovernorate.body, body),
    );
  }

  @Post(adminCreateArea.path)
  createArea(@Param() params: unknown, @Body() body: unknown): Promise<Catalog> {
    const { governorateId } = parseInput(adminCreateArea.params, params);
    return this.catalog.createArea(governorateId, parseInput(adminCreateArea.body, body));
  }

  @Patch(adminUpdateArea.path)
  updateArea(@Param() params: unknown, @Body() body: unknown): Promise<Catalog> {
    const { areaId } = parseInput(adminUpdateArea.params, params);
    return this.catalog.updateArea(areaId, parseInput(adminUpdateArea.body, body));
  }

  @Get(adminListSports.path)
  async listSports() {
    return { items: await this.catalog.adminSports() };
  }

  @Post(adminCreateSport.path)
  createSport(@Body() body: unknown): Promise<Catalog> {
    return this.catalog.createSport(parseInput(adminCreateSport.body, body));
  }

  @Patch(adminUpdateSport.path)
  updateSport(@Param() params: unknown, @Body() body: unknown): Promise<Catalog> {
    const { sportId } = parseInput(adminUpdateSport.params, params);
    return this.catalog.updateSport(sportId, parseInput(adminUpdateSport.body, body));
  }
}
