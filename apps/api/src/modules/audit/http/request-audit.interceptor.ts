import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  Logger,
  type NestInterceptor,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { type Observable, mergeMap } from 'rxjs';
import { endpointFor } from '../../../platform/auth/endpoint-registry.js';
import { requestMeta } from '../../../platform/http/request-context.js';
import { AuditService } from '../application/audit.service.js';

const SECRET_KEY = /pass(word)?|code|token|secret|otp|totp/i;
const MAX_DETAILS = 8_000;

/** Removes secrets and shortens long values before a request body goes into the audit log. */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 5) return '[…]';
  if (typeof value === 'string') return value.length > 500 ? `${value.slice(0, 500)}…` : value;
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        k,
        SECRET_KEY.test(k) ? '[redacted]' : redact(v, depth + 1),
      ]),
    );
  }
  return value;
}

/**
 * Append-only trail of every change made by platform staff and venue staff (docs/rbac-plan.md
 * §6): who, which operation, on what, with which (redacted) input. Services add their own
 * entries with before/after values for the important changes.
 */
@Injectable()
export class RequestAuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger('RequestAudit');

  constructor(private readonly audit: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const route = request.routeOptions?.url ?? '';
    const mutating = !['GET', 'HEAD', 'OPTIONS'].includes(request.method);
    const actor = request.actor;
    const staff = actor?.kind === 'admin';
    const venueStaff = actor?.kind === 'user' && route.startsWith('/v1/manage');
    if (!mutating || !actor || (!staff && !venueStaff)) return next.handle();

    return next.handle().pipe(
      mergeMap(async (result: unknown) => {
        const params = (request.params ?? {}) as Record<string, string>;
        const [targetKey, targetId] = Object.entries(params).find(([k]) => k.endsWith('Id')) ?? [];
        const raw = request.body;
        const upload =
          Buffer.isBuffer(raw) ||
          String(request.headers['content-type'] ?? '').startsWith('multipart/');
        let body = upload ? { upload: true } : redact(raw);
        if (JSON.stringify(body ?? null).length > MAX_DETAILS) body = { truncated: true };
        try {
          await this.audit.record({
            actorType: staff ? 'admin' : 'user',
            actorUserId: actor.userId,
            action: staff ? 'request.admin' : 'request.venue',
            ...(targetKey && targetId
              ? { targetType: targetKey.slice(0, -2), targetId: String(targetId) }
              : {}),
            organizationId: request.tenant?.organizationId ?? null,
            details: {
              endpoint: `${request.method} ${route}`,
              summary: endpointFor(request.method, route)?.summary ?? null,
              params,
              body: body ?? null,
              ...(request.tenant ? { venueRole: request.tenant.role } : {}),
              ...(actor.kind === 'admin' ? { platformRole: actor.platformRole } : {}),
            },
            meta: requestMeta(request),
          });
        } catch (error) {
          this.logger.error(`Audit record failed for ${request.method} ${route}: ${String(error)}`);
        }
        return result;
      }),
    );
  }
}
