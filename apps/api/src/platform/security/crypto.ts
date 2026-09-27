import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function hmacHex(key: string, value: string): string {
  return createHmac('sha256', key).update(value, 'utf8').digest('hex');
}

/** Constant-time comparison of two hex digests of equal length. */
export function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  return ab.length === bb.length && ab.length > 0 && timingSafeEqual(ab, bb);
}

/** URL-safe random token with `bytes` bytes of entropy. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

function deriveKey(secret: string, purpose: string): Buffer {
  return Buffer.from(hkdfSync('sha256', secret, 'jordan-sports', purpose, 32));
}

/** AES-256-GCM encryption for small secrets at rest. Output: base64url(iv).(tag).(ciphertext). */
export function encryptSecret(secret: string, purpose: string, plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(secret, purpose), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map((b) => b.toString('base64url')).join('.');
}

export function decryptSecret(secret: string, purpose: string, encrypted: string): string {
  const [iv, tag, ciphertext] = encrypted.split('.').map((p) => Buffer.from(p, 'base64url'));
  if (!iv || !tag || !ciphertext) throw new Error('Malformed encrypted value');
  const decipher = createDecipheriv('aes-256-gcm', deriveKey(secret, purpose), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
