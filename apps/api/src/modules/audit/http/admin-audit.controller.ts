import { Controller, Get, Header, Query } from '@nestjs/common';
import {
  adminExportAuditLogs,
  adminListAuditLogs,
  type EndpointOutput,
} from '@jordan-sports/contracts';
import { AdminAuth } from '../../../platform/auth/decorators.js';
import { parseInput } from '../../../platform/http/validation.js';
import { AuditService } from '../application/audit.service.js';

@Controller()
@AdminAuth()
export class AdminAuditController {
  constructor(private readonly audit: AuditService) {}

  @Get(adminListAuditLogs.path)
  list(@Query() query: unknown): Promise<EndpointOutput<typeof adminListAuditLogs>> {
    return this.audit.list(parseInput(adminListAuditLogs.query, query));
  }

  @Get(adminExportAuditLogs.path)
  @Header('content-type', 'text/csv; charset=utf-8')
  @Header('content-disposition', 'attachment; filename="audit-log.csv"')
  @Header('cache-control', 'no-store')
  exportCsv(@Query() query: unknown): Promise<string> {
    return this.audit.csv(parseInput(adminExportAuditLogs.query, query));
  }
}
