import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { AuthService } from '../../modules/identity/application/auth.service.js';
import { hasPlatformPermission } from '../../modules/identity/domain/platform-permissions.js';
import { Errors } from '../http/errors.js';
import { ADMIN_SESSION_COOKIE, WEB_SESSION_COOKIE } from './cookies.js';
import { AUTH_REQUIREMENT, type AuthRequirement } from './decorators.js';

/**
 * Global authentication guard. Routes are private by default: without a decorator a signed-in
 * user session is required. Admin routes only accept the admin session cookie.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requirement = this.reflector.getAllAndOverride<AuthRequirement | undefined>(
      AUTH_REQUIREMENT,
      [context.getHandler(), context.getClass()],
    ) ?? { kind: 'user' };
    if (requirement.kind === 'public') return true;

    const request = context.switchToHttp().getRequest<FastifyRequest>();
    if (requirement.kind === 'admin') {
      const actor = await this.auth.resolveSession(
        request.cookies[ADMIN_SESSION_COOKIE] ?? '',
        'admin',
      );
      if (!actor || actor.kind !== 'admin') throw Errors.unauthenticated();
      if (
        requirement.permission &&
        !hasPlatformPermission(actor.platformRole, requirement.permission)
      ) {
        throw Errors.forbidden();
      }
      request.actor = actor;
      return true;
    }

    const actor = await this.auth.resolveSession(request.cookies[WEB_SESSION_COOKIE] ?? '', 'web');
    if (!actor) throw Errors.unauthenticated();
    request.actor = actor;
    return true;
  }
}
