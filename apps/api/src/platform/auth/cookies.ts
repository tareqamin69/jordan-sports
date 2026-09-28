import type { FastifyReply } from 'fastify';

export const WEB_SESSION_COOKIE = 'js_session';
export const ADMIN_SESSION_COOKIE = 'js_admin_session';
/** Long-lived random id of a staff member's browser (sign-in alerts for new devices). */
export const ADMIN_DEVICE_COOKIE = 'js_admin_device';
export const ADMIN_DEVICE_MAX_AGE_SECONDS = 400 * 24 * 60 * 60;

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
