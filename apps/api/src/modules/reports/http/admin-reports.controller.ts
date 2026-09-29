import { Controller, Get, Header, Query } from '@nestjs/common';
import {
  adminExportBookings,
  adminReportsOverview,
  hasPlatformPermission,
} from '@jordan-sports/contracts';
import type { Actor } from '../../../platform/auth/actor.js';
import { AdminAuth, CurrentActor } from '../../../platform/auth/decorators.js';
import { parseInput } from '../../../platform/http/validation.js';
import { ReportsService } from '../application/reports.service.js';

@Controller()
@AdminAuth()
export class AdminReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get(adminReportsOverview.path)
  overview(@Query() query: unknown, @CurrentActor() actor: Actor) {
    const { period } = parseInput(adminReportsOverview.query, query);
    const revenue =
      actor.kind === 'admin' && hasPlatformPermission(actor.platformRole, 'revenue.read');
    return this.reports.overview(period, revenue);
  }

  @Get(adminExportBookings.path)
  @Header('content-type', 'text/csv; charset=utf-8')
  @Header('content-disposition', 'attachment; filename="bookings.csv"')
  @Header('cache-control', 'no-store')
  exportBookings(@Query() query: unknown) {
    const { from, to } = parseInput(adminExportBookings.query, query);
    return this.reports.bookingsCsv(from, to);
  }
}
