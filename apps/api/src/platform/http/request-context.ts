import type { FastifyRequest } from 'fastify';

export interface RequestMeta {
  readonly ip: string | null;
  readonly userAgent: string | null;
  readonly requestId: string;
}

export function requestMeta(request: FastifyRequest): RequestMeta {
  const ua = request.headers['user-agent'];
  return {
    ip: request.ip || null,
    userAgent: typeof ua === 'string' ? ua.slice(0, 500) : null,
    requestId: String(request.id),
  };
}
