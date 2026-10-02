import { Body, Controller, HttpCode, Inject, Post, Res } from '@nestjs/common';
import {
  completeSignup,
  LEGAL_TEXTS_VERSION,
  requestOtp,
  signOut,
  verifyOtp,
  type EndpointOutput,
} from '@jordan-sports/contracts';
import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  clearSessionCookie,
  setSessionCookie,
  WEB_SESSION_COOKIE,
} from '../../../platform/auth/cookies.js';
import { CurrentRequest, Public } from '../../../platform/auth/decorators.js';
import type { AppConfig } from '../../../platform/config/config.js';
import { APP_CONFIG } from '../../../platform/config/config.module.js';
import { requestMeta } from '../../../platform/http/request-context.js';
import { parseInput } from '../../../platform/http/validation.js';
import { AuthService, WEB_SESSION_TTL_SECONDS } from '../../identity/index.js';
import { AccountService } from '../application/account.service.js';

function localeOf(request: FastifyRequest): 'ar' | 'en' {
  const header = request.headers['accept-language'];
  return typeof header === 'string' && header.toLowerCase().startsWith('en') ? 'en' : 'ar';
}

@Controller()
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly account: AccountService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Post(requestOtp.path)
  @HttpCode(200)
  @Public()
  request(@Body() body: unknown, @CurrentRequest() request: FastifyRequest) {
    const { phone } = parseInput(requestOtp.body, body);
    return this.auth.requestOtp(phone, localeOf(request), requestMeta(request));
  }

  @Post(verifyOtp.path)
  @HttpCode(200)
  @Public()
  async verify(
    @Body() body: unknown,
    @CurrentRequest() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<EndpointOutput<typeof verifyOtp>> {
    const input = parseInput(verifyOtp.body, body);
    const result = await this.auth.verifyOtp(input.phone, input.code, requestMeta(request));
    if (result.status === 'profile_required') return result;
    setSessionCookie(
      reply,
      WEB_SESSION_COOKIE,
      result.sessionToken,
      WEB_SESSION_TTL_SECONDS,
      this.config.cookieSecure,
    );
    return { status: 'signed_in', user: await this.account.me(result.userId) };
  }

  @Post(completeSignup.path)
  @HttpCode(200)
  @Public()
  async signup(
    @Body() body: unknown,
    @CurrentRequest() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<EndpointOutput<typeof completeSignup>> {
    const input = parseInput(completeSignup.body, body);
    const session = await this.auth.completeSignup(
      input.signupToken,
      {
        displayName: input.displayName,
        locale: input.locale,
        preferredMode: input.preferredMode,
        termsVersion: LEGAL_TEXTS_VERSION,
        marketingOptIn: input.marketingOptIn,
      },
      requestMeta(request),
    );
    setSessionCookie(
      reply,
      WEB_SESSION_COOKIE,
      session.sessionToken,
      WEB_SESSION_TTL_SECONDS,
      this.config.cookieSecure,
    );
    return { status: 'signed_in', user: await this.account.me(session.userId) };
  }

  @Post(signOut.path)
  @HttpCode(200)
  @Public()
  async signOut(
    @CurrentRequest() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<{ ok: true }> {
    await this.auth.revokeSession(request.cookies[WEB_SESSION_COOKIE] ?? '');
    clearSessionCookie(reply, WEB_SESSION_COOKIE, this.config.cookieSecure);
    return { ok: true };
  }
}
