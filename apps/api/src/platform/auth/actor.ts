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
  }
}
