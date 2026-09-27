import { type DynamicModule, Module } from '@nestjs/common';
import type { AppConfig } from '../../platform/config/config.js';
import { AuthService } from './application/auth.service.js';
import { ConsoleOtpSender, OTP_SENDER } from './application/otp-sender.js';
import { UsersService } from './application/users.service.js';
import { AdminAuthController } from './http/admin-auth.controller.js';
import { AdminUsersController } from './http/admin-users.controller.js';
import { DevOtpController } from './http/dev-otp.controller.js';

@Module({})
export class IdentityModule {
  static forRoot(config: AppConfig): DynamicModule {
    const devOnly = config.otpChannel === 'console' && config.nodeEnv !== 'production';
    return {
      module: IdentityModule,
      global: true,
      providers: [
        AuthService,
        UsersService,
        // Only the development console channel exists until an SMS/WhatsApp provider is chosen.
        { provide: OTP_SENDER, useValue: new ConsoleOtpSender() },
      ],
      controllers: [
        AdminAuthController,
        AdminUsersController,
        ...(devOnly ? [DevOtpController] : []),
      ],
      exports: [AuthService, UsersService],
    };
  }
}
