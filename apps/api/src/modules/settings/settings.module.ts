import { Global, Module } from '@nestjs/common';
import { SettingsService } from './application/settings.service.js';
import { AdminSettingsController } from './http/admin-settings.controller.js';

@Global()
@Module({
  providers: [SettingsService],
  controllers: [AdminSettingsController],
  exports: [SettingsService],
})
export class SettingsModule {}
