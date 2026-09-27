import { Body, Controller, Get, Patch } from '@nestjs/common';
import { getMe, updateMe, type Me } from '@jordan-sports/contracts';
import type { Actor } from '../../../platform/auth/actor.js';
import { CurrentActor, UserAuth } from '../../../platform/auth/decorators.js';
import { parseInput } from '../../../platform/http/validation.js';
import { UsersService } from '../../identity/index.js';
import { AccountService } from '../application/account.service.js';

@Controller()
export class MeController {
  constructor(
    private readonly account: AccountService,
    private readonly users: UsersService,
  ) {}

  @Get(getMe.path)
  @UserAuth()
  me(@CurrentActor() actor: Actor): Promise<Me> {
    return this.account.me(actor.userId);
  }

  @Patch(updateMe.path)
  @UserAuth()
  async update(@CurrentActor() actor: Actor, @Body() body: unknown): Promise<Me> {
    const input = parseInput(updateMe.body, body);
    await this.users.updateProfile(actor.userId, {
      ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
      ...(input.locale !== undefined ? { locale: input.locale } : {}),
    });
    return this.account.me(actor.userId);
  }
}
