import { Global, Module } from '@nestjs/common';
import { MembershipsService } from './application/memberships.service.js';
import { OrganizationsService } from './application/organizations.service.js';
import { VenueTeamService } from './application/venue-team.service.js';
import { AdminOrganizationsController } from './http/admin-organizations.controller.js';
import { VenueTeamController } from './http/venue-team.controller.js';

@Global()
@Module({
  providers: [MembershipsService, OrganizationsService, VenueTeamService],
  controllers: [AdminOrganizationsController, VenueTeamController],
  exports: [MembershipsService, OrganizationsService],
})
export class TenancyModule {}
