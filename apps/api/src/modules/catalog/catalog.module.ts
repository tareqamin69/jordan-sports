import { Global, Module } from '@nestjs/common';
import { CatalogService } from './application/catalog.service.js';
import { CatalogController } from './http/catalog.controller.js';

@Global()
@Module({
  providers: [CatalogService],
  controllers: [CatalogController],
  exports: [CatalogService],
})
export class CatalogModule {}
