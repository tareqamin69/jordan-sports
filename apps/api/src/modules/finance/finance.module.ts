import { Module } from '@nestjs/common';
import { PayoutsService } from './application/payouts.service.js';
import { AdminPayoutsController, ManagePayoutsController } from './http/payouts.controller.js';

/** Venue earnings and weekly payouts of card bookings (ADR-0020). */
@Module({
  providers: [PayoutsService],
  controllers: [ManagePayoutsController, AdminPayoutsController],
  exports: [PayoutsService],
})
export class FinanceModule {}
