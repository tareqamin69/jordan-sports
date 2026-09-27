import { Global, Module } from '@nestjs/common';
import { PricingService } from './application/pricing.service.js';
import { ManagePricingController } from './http/manage-pricing.controller.js';

@Global()
@Module({
  providers: [PricingService],
  controllers: [ManagePricingController],
  exports: [PricingService],
})
export class PricingModule {}
