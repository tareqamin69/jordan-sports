import { Controller, Get } from '@nestjs/common';
import { getCatalog, type Catalog } from '@jordan-sports/contracts';
import { Public } from '../../../platform/auth/decorators.js';
import { CatalogService } from '../application/catalog.service.js';

@Controller()
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get(getCatalog.path)
  @Public()
  get(): Promise<Catalog> {
    return this.catalog.get();
  }
}
