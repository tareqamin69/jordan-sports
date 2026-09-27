import { Global, Module } from '@nestjs/common';
import { AvailabilityService } from './application/availability.service.js';
import { HolidaysService } from './application/holidays.service.js';
import { ManageScheduleService } from './application/manage-schedule.service.js';
import { OccupancyService } from './application/occupancy.service.js';
import { ScheduleDataService } from './application/schedule-data.service.js';
import { AdminHolidaysController } from './http/admin-holidays.controller.js';
import { AvailabilityController } from './http/availability.controller.js';
import { ManageScheduleController } from './http/manage-schedule.controller.js';

@Global()
@Module({
  providers: [
    OccupancyService,
    ScheduleDataService,
    AvailabilityService,
    ManageScheduleService,
    HolidaysService,
  ],
  controllers: [AvailabilityController, ManageScheduleController, AdminHolidaysController],
  exports: [OccupancyService, ScheduleDataService, AvailabilityService],
})
export class SchedulingModule {}
