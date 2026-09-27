import { Global, Module } from '@nestjs/common';
import { AuditService } from './application/audit.service.js';
import { AdminAuditController } from './http/admin-audit.controller.js';

@Global()
@Module({
  providers: [AuditService],
  controllers: [AdminAuditController],
  exports: [AuditService],
})
export class AuditModule {}
