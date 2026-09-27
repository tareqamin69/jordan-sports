import { Global, Module } from '@nestjs/common';
import { CatalogService } from './application/catalog.service.js';
import { AdminCatalogController } from './http/admin-catalog.controller.js';
import { CatalogController } from './http/catalog.controller.js';

@Global()
@Module({
  providers: [CatalogService],
  controllers: [CatalogController, AdminCatalogController],
  exports: [CatalogService],
})
export class CatalogModule {}
