import type { FastifyReply } from 'fastify';

export const WEB_SESSION_COOKIE = 'js_session';
export const ADMIN_SESSION_COOKIE = 'js_admin_session';

export function setSessionCookie(
  reply: FastifyReply,
  name: string,
  token: string,
  maxAgeSeconds: number,
  secure: boolean,
): void {
  void reply.setCookie(name, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: maxAgeSeconds,
  });
}

export function clearSessionCookie(reply: FastifyReply, name: string, secure: boolean): void {
  void reply.clearCookie(name, { httpOnly: true, sameSite: 'lax', secure, path: '/' });
}
