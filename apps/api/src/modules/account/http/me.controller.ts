import { Body, Controller, Get, HttpCode, Patch, Post } from '@nestjs/common';
import { deleteMyAccount, getMe, updateMe, type Me } from '@jordan-sports/contracts';
import type { FastifyRequest } from 'fastify';
import type { Actor } from '../../../platform/auth/actor.js';
import { CurrentActor, CurrentRequest, UserAuth } from '../../../platform/auth/decorators.js';
import { requestMeta } from '../../../platform/http/request-context.js';
import { parseInput } from '../../../platform/http/validation.js';
import { UsersService } from '../../identity/index.js';
import { AccountService } from '../application/account.service.js';
import { PrivacyService } from '../application/privacy.service.js';

@Controller()
export class MeController {
  constructor(
    private readonly account: AccountService,
    private readonly users: UsersService,
    private readonly privacy: PrivacyService,
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
    if (input.marketingOptIn !== undefined) {
      await this.privacy.setMarketing(actor.userId, input.marketingOptIn);
    }
    return this.account.me(actor.userId);
  }

  @Post(deleteMyAccount.path)
  @HttpCode(200)
  @UserAuth()
  async delete(
    @CurrentActor() actor: Actor,
    @Body() body: unknown,
    @CurrentRequest() request: FastifyRequest,
  ): Promise<{ ok: true }> {
    parseInput(deleteMyAccount.body, body);
    await this.privacy.deleteAccount(actor.userId, requestMeta(request));
    return { ok: true };
  }
}
