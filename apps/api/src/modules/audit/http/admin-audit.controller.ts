import { Controller, Get, Query } from '@nestjs/common';
import { adminListAuditLogs, type EndpointOutput } from '@jordan-sports/contracts';
import { AdminAuth } from '../../../platform/auth/decorators.js';
import { parseInput } from '../../../platform/http/validation.js';
import { AuditService } from '../application/audit.service.js';

@Controller()
export class AdminAuditController {
  constructor(private readonly audit: AuditService) {}

  @Get(adminListAuditLogs.path)
  @AdminAuth('audit.read')
  list(@Query() query: unknown): Promise<EndpointOutput<typeof adminListAuditLogs>> {
    const q = parseInput(adminListAuditLogs.query, query);
    return this.audit.list({
      limit: q.limit,
      ...(q.cursor ? { cursor: q.cursor } : {}),
      ...(q.organizationId ? { organizationId: q.organizationId } : {}),
    });
  }
}
