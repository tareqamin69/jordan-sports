import { Module } from '@nestjs/common';
import { ComplaintsService } from './application/complaints.service.js';
import { AdminComplaintsController, MyComplaintsController } from './http/complaints.controller.js';

@Module({
  providers: [ComplaintsService],
  controllers: [MyComplaintsController, AdminComplaintsController],
})
export class ComplaintsModule {}
