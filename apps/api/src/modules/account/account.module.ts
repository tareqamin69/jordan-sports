import { Module } from '@nestjs/common';
import { AccountService } from './application/account.service.js';
import { PrivacyService } from './application/privacy.service.js';
import { AdminPrivacyController } from './http/admin-privacy.controller.js';
import { AuthController } from './http/auth.controller.js';
import { MeController } from './http/me.controller.js';

@Module({
  providers: [AccountService, PrivacyService],
  controllers: [AuthController, MeController, AdminPrivacyController],
})
export class AccountModule {}
