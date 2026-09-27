import { Module } from '@nestjs/common';
import { AccountService } from './application/account.service.js';
import { AuthController } from './http/auth.controller.js';
import { MeController } from './http/me.controller.js';

@Module({
  providers: [AccountService],
  controllers: [AuthController, MeController],
})
export class AccountModule {}
