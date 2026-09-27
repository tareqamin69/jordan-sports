import { Body, Controller, Get, HttpCode, Inject, Post, Res } from '@nestjs/common';
import { adminSignIn, adminSignOut, getAdminMe, type AdminMe } from '@jordan-sports/contracts';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Actor } from '../../../platform/auth/actor.js';
import {
  ADMIN_SESSION_COOKIE,
  clearSessionCookie,
  setSessionCookie,
} from '../../../platform/auth/cookies.js';
import {
  AdminAuth,
  CurrentActor,
  CurrentRequest,
  Public,
} from '../../../platform/auth/decorators.js';
import type { AppConfig } from '../../../platform/config/config.js';
import { APP_CONFIG } from '../../../platform/config/config.module.js';
import { requestMeta } from '../../../platform/http/request-context.js';
import { parseInput } from '../../../platform/http/validation.js';
import { ADMIN_SESSION_TTL_SECONDS, AuthService } from '../application/auth.service.js';
import { platformRolePermissions } from '../domain/platform-permissions.js';

@Controller()
export class AdminAuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  private async profile(userId: string): Promise<AdminMe> {
    const p = await this.auth.adminProfile(userId);
    return { ...p, permissions: [...platformRolePermissions[p.platformRole]] };
  }

  @Post(adminSignIn.path)
  @HttpCode(200)
  @Public()
  async signIn(
    @Body() body: unknown,
    @CurrentRequest() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<AdminMe> {
    const input = parseInput(adminSignIn.body, body);
    const session = await this.auth.adminSignIn(
      input.email,
      input.password,
      input.totpCode,
      requestMeta(request),
    );
    setSessionCookie(
      reply,
      ADMIN_SESSION_COOKIE,
      session.sessionToken,
      ADMIN_SESSION_TTL_SECONDS,
      this.config.cookieSecure,
    );
    return this.profile(session.userId);
  }

  @Post(adminSignOut.path)
  @HttpCode(200)
  @Public()
  async signOut(
    @CurrentRequest() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<{ ok: true }> {
    await this.auth.revokeSession(request.cookies[ADMIN_SESSION_COOKIE] ?? '');
    clearSessionCookie(reply, ADMIN_SESSION_COOKIE, this.config.cookieSecure);
    return { ok: true };
  }

  @Get(getAdminMe.path)
  @AdminAuth()
  me(@CurrentActor() actor: Actor): Promise<AdminMe> {
    return this.profile(actor.userId);
  }
}
