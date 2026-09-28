import { Body, Controller, Get, HttpCode, Inject, Post, Res } from '@nestjs/common';
import {
  adminReauth,
  adminSignIn,
  adminSignOut,
  completeAccountSetup,
  getAdminMe,
  inspectAccountSetup,
  type AccountSetup,
  type AdminMe,
} from '@jordan-sports/contracts';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Actor } from '../../../platform/auth/actor.js';
import {
  ADMIN_DEVICE_COOKIE,
  ADMIN_DEVICE_MAX_AGE_SECONDS,
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
import {
  ADMIN_SESSION_TTL_SECONDS,
  AuthService,
  type IssuedAdminSession,
} from '../application/auth.service.js';
import { StaffSetupService } from '../application/staff-setup.service.js';
import { REAUTH_WINDOW_MINUTES } from '@jordan-sports/contracts';
import { platformRolePermissions } from '../domain/platform-permissions.js';

@Controller()
export class AdminAuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly setup: StaffSetupService,
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
      request.cookies[ADMIN_DEVICE_COOKIE] ?? null,
    );
    return this.signedIn(reply, session);
  }

  private signedIn(reply: FastifyReply, session: IssuedAdminSession): Promise<AdminMe> {
    setSessionCookie(
      reply,
      ADMIN_SESSION_COOKIE,
      session.sessionToken,
      ADMIN_SESSION_TTL_SECONDS,
      this.config.cookieSecure,
    );
    if (session.newDeviceToken) {
      setSessionCookie(
        reply,
        ADMIN_DEVICE_COOKIE,
        session.newDeviceToken,
        ADMIN_DEVICE_MAX_AGE_SECONDS,
        this.config.cookieSecure,
      );
    }
    return this.profile(session.userId);
  }

  @Post(inspectAccountSetup.path)
  @HttpCode(200)
  @Public()
  inspectSetup(
    @Body() body: unknown,
    @CurrentRequest() request: FastifyRequest,
  ): Promise<AccountSetup> {
    const { token } = parseInput(inspectAccountSetup.body, body);
    return this.setup.inspect(token, requestMeta(request));
  }

  @Post(completeAccountSetup.path)
  @HttpCode(200)
  @Public()
  async completeSetup(
    @Body() body: unknown,
    @CurrentRequest() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<AdminMe> {
    const input = parseInput(completeAccountSetup.body, body);
    const session = await this.setup.complete(
      input,
      requestMeta(request),
      request.cookies[ADMIN_DEVICE_COOKIE] ?? null,
    );
    return this.signedIn(reply, session);
  }

  @Post(adminReauth.path)
  @HttpCode(200)
  @AdminAuth()
  async reauth(
    @Body() body: unknown,
    @CurrentActor() actor: Actor,
    @CurrentRequest() request: FastifyRequest,
  ): Promise<{ reauthenticatedUntil: string }> {
    const { password, totpCode } = parseInput(adminReauth.body, body);
    if (actor.kind !== 'admin') throw new Error('unreachable');
    const at = await this.auth.reauthenticate(actor, password, totpCode, requestMeta(request));
    return {
      reauthenticatedUntil: new Date(at.getTime() + REAUTH_WINDOW_MINUTES * 60_000).toISOString(),
    };
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
