import { Global, Module } from '@nestjs/common';
import { MembershipsService } from './application/memberships.service.js';
import { OrganizationsService } from './application/organizations.service.js';
import { AdminOrganizationsController } from './http/admin-organizations.controller.js';

@Global()
@Module({
  providers: [MembershipsService, OrganizationsService],
  controllers: [AdminOrganizationsController],
  exports: [MembershipsService, OrganizationsService],
})
export class TenancyModule {}
