import { Module } from '@nestjs/common';
import { ReportsService } from './application/reports.service.js';
import { AdminReportsController } from './http/admin-reports.controller.js';

@Module({
  providers: [ReportsService],
  controllers: [AdminReportsController],
  exports: [ReportsService],
})
export class ReportsModule {}
