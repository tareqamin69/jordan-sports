import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import type { PlatformPermission } from '../../modules/identity/domain/platform-permissions.js';
import type { Actor } from './actor.js';

export const AUTH_REQUIREMENT = 'auth:requirement';

export type AuthRequirement =
  | { readonly kind: 'public' }
  | { readonly kind: 'user' }
  | { readonly kind: 'admin'; readonly permission?: PlatformPermission };

/** No session required. */
export const Public = () =>
  SetMetadata(AUTH_REQUIREMENT, { kind: 'public' } satisfies AuthRequirement);
/** A signed-in user (player or venue staff) session is required. Default for undecorated routes. */
export const UserAuth = () =>
  SetMetadata(AUTH_REQUIREMENT, { kind: 'user' } satisfies AuthRequirement);
/** A platform staff session is required, optionally with a permission. */
export const AdminAuth = (permission?: PlatformPermission) =>
  SetMetadata(AUTH_REQUIREMENT, {
    kind: 'admin',
    ...(permission ? { permission } : {}),
  } satisfies AuthRequirement);

export const CurrentActor = createParamDecorator((_: unknown, ctx: ExecutionContext): Actor => {
  const request = ctx.switchToHttp().getRequest<FastifyRequest>();
  if (!request.actor) throw new Error('CurrentActor used on a route without authentication');
  return request.actor;
});

export const CurrentRequest = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): FastifyRequest =>
    ctx.switchToHttp().getRequest<FastifyRequest>(),
);
