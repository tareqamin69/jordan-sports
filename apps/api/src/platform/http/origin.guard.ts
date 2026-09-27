import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import type { AppConfig } from '../config/config.js';
import { APP_CONFIG } from '../config/config.module.js';
import { AppError } from './errors.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF defence (docs/architecture.md §L): state-changing requests must come from one of our own
 * origins. Cookies are SameSite=Lax as a second layer. Admin routes accept only admin origins.
 * Webhooks (later) are authenticated by signature and are exempt.
 */
@Injectable()
export class OriginGuard implements CanActivate {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    if (SAFE_METHODS.has(request.method)) return true;
    const path = request.url.split('?')[0] ?? '';
    if (path.startsWith('/v1/webhooks/')) return true;

    const origin = request.headers.origin;
    const allowed = path.startsWith('/v1/admin/')
      ? this.config.adminOrigins
      : this.config.webOrigins;
    if (typeof origin !== 'string' || !allowed.includes(origin)) {
      throw new AppError('ORIGIN_NOT_ALLOWED', 403);
    }
    return true;
  }
}
