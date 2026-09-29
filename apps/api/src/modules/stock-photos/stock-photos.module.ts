import { Global, Module } from '@nestjs/common';
import { StockPhotosService } from './application/stock-photos.service.js';
import { StockPhotosController } from './http/stock-photos.controller.js';

@Global()
@Module({
  providers: [StockPhotosService],
  controllers: [StockPhotosController],
  exports: [StockPhotosService],
})
export class StockPhotosModule {}
