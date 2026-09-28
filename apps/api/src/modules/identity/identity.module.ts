import { type DynamicModule, Module } from '@nestjs/common';
import type { AppConfig } from '../../platform/config/config.js';
import { AuthService } from './application/auth.service.js';
import { ConsoleOtpSender, OTP_SENDER, type OtpSender } from './application/otp-sender.js';
import { ReleansOtpSender } from './application/releans-otp-sender.js';
import { ReleansClient } from '../../platform/sms/releans.js';
import { StaffSetupService } from './application/staff-setup.service.js';
import { TeamService } from './application/team.service.js';
import { UsersService } from './application/users.service.js';
import { AdminAuthController } from './http/admin-auth.controller.js';
import { AdminTeamController } from './http/admin-team.controller.js';
import { AdminUsersController } from './http/admin-users.controller.js';
import { DevOtpController } from './http/dev-otp.controller.js';

@Module({})
export class IdentityModule {
  static forRoot(config: AppConfig): DynamicModule {
    // Development, tests and staging only (staging shows codes on screen; see docs/staging.md).
    const devOnly =
      config.otpChannel === 'console' && (config.nodeEnv !== 'production' || config.staging);
    return {
      module: IdentityModule,
      global: true,
      providers: [
        AuthService,
        StaffSetupService,
        TeamService,
        UsersService,
        {
          provide: OTP_SENDER,
          useValue: (config.releans
            ? new ReleansOtpSender(new ReleansClient(config.releans))
            : new ConsoleOtpSender()) satisfies OtpSender,
        },
      ],
      controllers: [
        AdminAuthController,
        AdminUsersController,
        AdminTeamController,
        ...(devOnly ? [DevOtpController] : []),
      ],
      exports: [AuthService, StaffSetupService, UsersService],
    };
  }
}
