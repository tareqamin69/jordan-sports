import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import {
  adminGetUser,
  adminListUsers,
  adminSetUserStatus,
  type AdminUser,
  type EndpointOutput,
} from '@jordan-sports/contracts';
import type { FastifyRequest } from 'fastify';
import type { Actor } from '../../../platform/auth/actor.js';
import { AdminAuth, CurrentActor, CurrentRequest } from '../../../platform/auth/decorators.js';
import { requestMeta } from '../../../platform/http/request-context.js';
import { parseInput } from '../../../platform/http/validation.js';
import { UsersService } from '../application/users.service.js';

@Controller()
export class AdminUsersController {
  constructor(private readonly users: UsersService) {}

  @Get(adminListUsers.path)
  @AdminAuth()
  list(@Query() query: unknown): Promise<EndpointOutput<typeof adminListUsers>> {
    const q = parseInput(adminListUsers.query, query);
    return this.users.adminList({
      limit: q.limit,
      ...(q.cursor ? { cursor: q.cursor } : {}),
      ...(q.q ? { q: q.q } : {}),
    });
  }

  @Get(adminGetUser.path)
  @AdminAuth()
  get(@Param() params: unknown) {
    return this.users.adminGet(parseInput(adminGetUser.params, params).userId);
  }

  @Post(adminSetUserStatus.path)
  @HttpCode(200)
  @AdminAuth()
  setStatus(
    @Param() params: unknown,
    @Body() body: unknown,
    @CurrentActor() actor: Actor,
    @CurrentRequest() request: FastifyRequest,
  ): Promise<AdminUser> {
    const { userId } = parseInput(adminSetUserStatus.params, params);
    const input = parseInput(adminSetUserStatus.body, body);
    return this.users.adminSetStatus(
      actor.userId,
      userId,
      input.status,
      input.reason,
      requestMeta(request),
    );
  }
}
