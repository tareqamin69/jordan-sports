import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { AuthService } from '../../modules/identity/application/auth.service.js';
import {
  hasOrgPermission,
  hasPlatformPermission,
  REAUTH_WINDOW_MINUTES,
  reauthPermissions,
} from '@jordan-sports/contracts';
import { AppError, Errors } from '../http/errors.js';
import { ADMIN_SESSION_COOKIE, WEB_SESSION_COOKIE } from './cookies.js';
import { AUTH_REQUIREMENT, type AuthRequirement } from './decorators.js';
import { endpointFor } from './endpoint-registry.js';
import { TenantResolver } from './tenant-resolver.js';

/**
 * Global authentication guard. Routes are private by default: without a decorator a signed-in
 * user session is required. Admin routes only accept the admin session cookie.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
    private readonly tenants: TenantResolver,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requirement = this.reflector.getAllAndOverride<AuthRequirement | undefined>(
      AUTH_REQUIREMENT,
      [context.getHandler(), context.getClass()],
    ) ?? { kind: 'user' };
    if (requirement.kind === 'public') return true;

    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const contract = endpointFor(request.method, request.routeOptions.url);
    if (requirement.kind === 'admin') {
      // The contract is the source of permissions (docs/rbac-plan.md); the decorator's permission
      // only covers the few routes that are not in the contracts (e.g. raw media downloads).
      const permission = contract?.permission ?? requirement.permission;
      const actor = await this.auth.resolveSession(
        request.cookies[ADMIN_SESSION_COOKIE] ?? '',
        'admin',
      );
      if (!actor || actor.kind !== 'admin') throw Errors.unauthenticated();
      // Fail closed: an admin route must be described by a contract (whose permission may be
      // "any staff") or declare a permission itself.
      if (!contract && !permission) throw Errors.forbidden();
      if (permission && !hasPlatformPermission(actor.platformRole, permission)) {
        throw Errors.forbidden();
      }
      // Dangerous actions need a recent password + authenticator confirmation.
      if (permission && reauthPermissions.includes(permission)) {
        const at = actor.reauthenticatedAt?.getTime() ?? 0;
        if (Date.now() - at > REAUTH_WINDOW_MINUTES * 60_000) {
          throw new AppError('REAUTH_REQUIRED', 403);
        }
      }
      request.actor = actor;
      return true;
    }

    const actor = await this.auth.resolveSession(request.cookies[WEB_SESSION_COOKIE] ?? '', 'web');
    if (!actor) throw Errors.unauthenticated();
    request.actor = actor;

    // Venue API: membership and permission in the organization that owns the path's resource,
    // checked before the handler (and before the body is read). Other tenants get 404.
    if (contract?.orgPermission) {
      const params = (request.params ?? {}) as Record<string, string | undefined>;
      const organizationId = await this.tenants.organizationFor(params);
      if (!organizationId) throw Errors.notFound();
      const role = await this.tenants.roleOf(actor.userId, organizationId);
      if (!role) throw Errors.notFound();
      if (!hasOrgPermission(role, contract.orgPermission)) throw Errors.forbidden();
      request.tenant = { organizationId, role };
    }
    return true;
  }
}
