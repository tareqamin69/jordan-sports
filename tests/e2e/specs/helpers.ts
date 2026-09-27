import { execFileSync } from 'node:child_process';
import { createHmac, randomInt } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { expect, type Page } from '@playwright/test';
import { API } from './support';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

export function randomPhone(): string {
  return `07${['7', '8', '9'][randomInt(0, 3)]}${String(randomInt(0, 10_000_000)).padStart(7, '0')}`;
}

/** Reads the latest code from the development-only OTP endpoint of the API. */
export async function latestOtp(phone: string): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const res = await fetch(`${API}/v1/dev/otp?phone=${encodeURIComponent(phone)}`);
    if (res.ok) return ((await res.json()) as { code: string }).code;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('No OTP was sent');
}

/** Signs up a new player through the real UI and returns their phone number. */
export async function signUpPlayer(page: Page, locale: 'ar' | 'en', name: string): Promise<string> {
  const phone = randomPhone();
  await page.goto(`http://127.0.0.1:3000/${locale}/sign-in`);
  await page.locator('input[name="phone"]').fill(phone);
  await page.locator('form button[type="submit"]').click();
  await page.locator('input[name="code"]').fill(await latestOtp(phone));
  await page.locator('form button[type="submit"]').click();
  await page.locator('input[name="displayName"]').fill(name);
  await page.locator('input[name="ageConfirmed"]').check();
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(new RegExp(`/${locale}/account$`));
  return phone;
}

/** RFC 6238 TOTP (SHA-1, 30 s, 6 digits) for the admin authenticator. */
export function totp(secretBase32: string, now = Date.now()): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const c of secretBase32) {
    value = (value << 5) | alphabet.indexOf(c);
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(now / 30_000)));
  const h = createHmac('sha1', Buffer.from(bytes)).update(counter).digest();
  const o = h[h.length - 1]! & 0xf;
  const code = ((h[o]! & 0x7f) << 24) | (h[o + 1]! << 16) | (h[o + 2]! << 8) | h[o + 3]!;
  return (code % 1_000_000).toString().padStart(6, '0');
}

export interface AdminAccount {
  email: string;
  password: string;
  totpSecret: string;
}

/** Creates a platform admin with the real CLI (the only way admins are created). */
export function createAdmin(): AdminAccount {
  const email = `e2e-admin-${Date.now()}-${randomInt(0, 1e6)}@example.com`;
  const password = 'e2e admin password 123';
  const out = execFileSync(
    'node',
    ['apps/api/dist/cli/admin.js', 'create', '--email', email, '--name', 'E2E Admin', '--json'],
    { cwd: ROOT, env: { ...process.env, ADMIN_PASSWORD: password }, encoding: 'utf8' },
  );
  const { totpSecret } = JSON.parse(out.trim().split('\n').at(-1)!) as { totpSecret: string };
  return { email, password, totpSecret };
}

export async function signInAdmin(page: Page, account: AdminAccount, locale: 'ar' | 'en' = 'en') {
  await page.goto(`http://127.0.0.1:3001/${locale}/sign-in`);
  await page.locator('input[name="email"]').fill(account.email);
  await page.locator('input[name="password"]').fill(account.password);
  await page.locator('input[name="totpCode"]').fill(totp(account.totpSecret));
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(new RegExp(`/${locale}$`));
}
