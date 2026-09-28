import { Global, Module } from '@nestjs/common';
import { FinanceService } from './application/finance.service.js';
import { AdminBalanceController, ManageBalanceController } from './http/finance.controller.js';

@Global()
@Module({
  providers: [FinanceService],
  controllers: [ManageBalanceController, AdminBalanceController],
  exports: [FinanceService],
})
export class FinanceModule {}
