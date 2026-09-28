import type { PlatformRole } from '@jordan-sports/contracts';

export type Actor =
  | { readonly kind: 'user'; readonly userId: string; readonly sessionId: string }
  | {
      readonly kind: 'admin';
      readonly userId: string;
      readonly sessionId: string;
      readonly platformRole: PlatformRole;
    };

declare module 'fastify' {
  interface FastifyRequest {
    actor?: Actor;
    /** Venue API: the organization owning the path's resource and the caller's role in it. */
    tenant?: { organizationId: string; role: import('@jordan-sports/contracts').MembershipRole };
  }
}
