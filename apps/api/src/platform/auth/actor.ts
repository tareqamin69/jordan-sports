import type { PlatformRole } from '@jordan-sports/contracts';

export type Actor =
  | { readonly kind: 'user'; readonly userId: string; readonly sessionId: string }
  | {
      readonly kind: 'admin';
      readonly userId: string;
      readonly sessionId: string;
      readonly platformRole: PlatformRole;
      /** Last password + authenticator confirmation on this session (sign-in or re-auth). */
      readonly reauthenticatedAt: Date | null;
    };

declare module 'fastify' {
  interface FastifyRequest {
    actor?: Actor;
    /** Venue API: the organization owning the path's resource and the caller's role in it. */
    tenant?: { organizationId: string; role: import('@jordan-sports/contracts').MembershipRole };
  }
}
