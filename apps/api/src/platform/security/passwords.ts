import { hash, verify } from '@node-rs/argon2';

/** Argon2id with the library's defaults (OWASP-aligned memory/time cost). */
export async function hashPassword(password: string): Promise<string> {
  return hash(password);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

/** Minimum policy for platform staff passwords. */
export function isAcceptablePassword(password: string): boolean {
  return password.length >= 12 && password.length <= 200;
}
