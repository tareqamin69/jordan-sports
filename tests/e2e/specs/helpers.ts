import { execFileSync } from 'node:child_process';
import { createHmac, randomInt } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { expect, request, type APIRequestContext, type Page } from '@playwright/test';
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

/**
 * Signs up a new player through the real UI and returns their phone number. `mode` picks the
 * "بدك تحجز وتلعب؟" / "عندك ملعب وبدك تضيفه؟" step (plan §2); it only decides the landing page —
 * player lands on `/`, venue on `/manage`.
 */
export async function signUpPlayer(
  page: Page,
  locale: 'ar' | 'en',
  name: string,
  phone = randomPhone(),
  mode: 'player' | 'venue' = 'player',
): Promise<string> {
  await page.goto(`http://127.0.0.1:3000/${locale}/sign-in`);
  await page.locator('input[name="phone"]').fill(phone);
  await page.locator('form button[type="submit"]').click();
  await page.locator('input[name="code"]').fill(await latestOtp(phone));
  await page.locator('form button[type="submit"]').click();
  await page.locator('input[name="displayName"]').fill(name);
  await page.locator('input[name="ageConfirmed"]').check();
  await page.locator('form button[type="submit"]').click();
  await page.getByTestId(`mode-${mode}`).click();
  await expect(page).toHaveURL(
    mode === 'venue' ? `http://127.0.0.1:3000/${locale}/manage` : `http://127.0.0.1:3000/${locale}`,
  );
  return phone;
}

/** Signs an existing user in through the real UI (phone + code). */
export async function signInExisting(page: Page, locale: 'ar' | 'en', phone: string) {
  await page.goto(`http://127.0.0.1:3000/${locale}/sign-in`);
  await page.locator('input[name="phone"]').fill(phone);
  await page.locator('form button[type="submit"]').click();
  // Wait for the new code to be sent (an older code for this phone may still be readable).
  await expect(page.locator('input[name="code"]')).toBeVisible();
  await page.locator('input[name="code"]').fill(await latestOtp(phone));
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(new RegExp(`/${locale}/account$`));
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

/**
 * Sets up the platform owner through the real one-time link (owner-setup-link.js), taking over
 * ownership from any previous e2e run. Returns the account and the page signed in.
 */
export async function setUpOwner(page: Page, locale: 'ar' | 'en' = 'en'): Promise<AdminAccount> {
  const email = `e2e-owner-${Date.now()}-${randomInt(0, 1e6)}@example.com`;
  const out = execFileSync(
    'node',
    ['apps/api/dist/cli/owner-setup-link.js', '--email', email, '--replace-owner'],
    { cwd: ROOT, env: process.env, encoding: 'utf8' },
  );
  const token = /#token=([A-Za-z0-9_-]+)/.exec(out)![1]!;
  await page.goto(`http://127.0.0.1:3001/${locale}/setup#token=${token}`);
  const totpSecret = (await page.getByTestId('totp-secret').textContent())!.trim();
  const password = 'e2e owner password 123';
  await page.locator('input[name="displayName"]').fill('E2E Owner');
  await page.locator('input[name="password"]').fill(password);
  await page.locator('input[name="confirm"]').fill(password);
  await page.locator('input[name="totpCode"]').fill(totp(totpSecret));
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(new RegExp(`/${locale}$`));
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

/** Admin API client (password + TOTP sign-in) for arranging test data quickly. */
export async function adminApi(account: AdminAccount): Promise<APIRequestContext> {
  const ctx = await request.newContext({
    baseURL: API,
    extraHTTPHeaders: { origin: 'http://127.0.0.1:3001' },
  });
  const res = await ctx.post('/v1/admin/auth/sign-in', {
    data: { email: account.email, password: account.password, totpCode: totp(account.totpSecret) },
  });
  if (!res.ok()) throw new Error(`admin sign-in failed: ${await res.text()}`);
  return ctx;
}

/** Creates an approved venue with one padel court through the admin API. */
export async function arrangeVenue(
  api: APIRequestContext,
): Promise<{ ownerPhone: string; venueId: string; slug: string; resourceId: string }> {
  const catalog = (await (await api.get('/v1/catalog')).json()) as {
    sports: Array<{ key: string; formats: Array<{ id: string; key: string }> }>;
    resourceTypes: Array<{ id: string; key: string }>;
    governorates: Array<{ id: string; key: string }>;
  };
  const suffix = `${Date.now()}-${randomInt(0, 1e6)}`;
  const ownerPhone = randomPhone();
  const org = await (
    await api.post('/v1/admin/organizations', {
      data: {
        slug: `e2e-org-${suffix}`,
        name: { en: `E2E Org ${suffix}`, ar: 'منشأة' },
        owner: { phone: ownerPhone, displayName: 'Owner' },
      },
    })
  ).json();
  const slug = `e2e-venue-${suffix}`;
  const venue = await (
    await api.post(`/v1/admin/organizations/${org.id}/venues`, {
      data: {
        slug,
        name: { en: `E2E Venue ${suffix}`, ar: 'ملعب تجريبي' },
        governorateId: catalog.governorates.find((c) => c.key === 'amman')!.id,
      },
    })
  ).json();
  const padel = catalog.sports.find((s) => s.key === 'padel')!.formats[0]!.id;
  const withResource = await (
    await api.post(`/v1/admin/venues/${venue.id}/resources`, {
      data: {
        name: { en: 'Court 1', ar: 'ملعب 1' },
        resourceTypeId: catalog.resourceTypes.find((t) => t.key === 'padel_court')!.id,
        sportFormatIds: [padel],
      },
    })
  ).json();
  const approved = await api.post(`/v1/admin/venues/${venue.id}/status`, {
    data: { status: 'approved', reason: 'E2E arrangement' },
  });
  if (!approved.ok()) throw new Error(await approved.text());
  return { ownerPhone, venueId: venue.id, slug, resourceId: withResource.resources[0].id };
}

/** Signs a player (or venue owner) in through the API and returns a client with the session. */
export async function userApi(phone: string, name = 'Player'): Promise<APIRequestContext> {
  const ctx = await request.newContext({
    baseURL: API,
    extraHTTPHeaders: { origin: 'http://127.0.0.1:3000' },
  });
  const requested = await ctx.post('/v1/auth/otp/request', { data: { phone } });
  if (!requested.ok()) throw new Error(`OTP request failed: ${await requested.text()}`);
  const verified = await (
    await ctx.post('/v1/auth/otp/verify', { data: { phone, code: await latestOtp(phone) } })
  ).json();
  if (verified.status !== 'signed_in') {
    const done = await ctx.post('/v1/auth/signup', {
      data: {
        signupToken: verified.signupToken,
        displayName: name,
        locale: 'en',
        ageConfirmed: true,
        preferredMode: 'player',
      },
    });
    if (!done.ok()) throw new Error(`Sign-up failed: ${await done.text()}`);
  }
  return ctx;
}

/**
 * Opens the venue every day 08:00–24:00 with 60/90 minute bookings every 30 minutes and a
 * single price band (60 min: 20 JOD, 90 min: 28 JOD).
 */
export async function makeBookable(owner: APIRequestContext, venueId: string, resourceId: string) {
  const steps = [
    owner.put(`/v1/manage/resources/${resourceId}/weekly-hours`, {
      data: {
        windows: [1, 2, 3, 4, 5, 6, 7].map((d) => ({
          dayOfWeek: d,
          startMinute: 480,
          durationMinutes: 960,
        })),
      },
    }),
    owner.put(`/v1/manage/resources/${resourceId}/policy`, {
      data: {
        slotDurations: [60, 90],
        startAlignmentMinutes: 30,
        minLeadMinutes: 0,
        maxAdvanceDays: 30,
        bufferBeforeMinutes: 0,
        bufferAfterMinutes: 0,
      },
    }),
    owner.post(`/v1/manage/venues/${venueId}/pricing`, {
      data: {
        resourceIds: [resourceId],
        rule: {
          daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
          startMinute: 0,
          endMinute: 1440,
          priority: 0,
          amounts: [
            { durationMinutes: 60, amount: 20000 },
            { durationMinutes: 90, amount: 28000 },
          ],
        },
      },
    }),
  ];
  for (const step of steps) {
    const res = await step;
    if (!res.ok()) throw new Error(`Venue setup failed: ${await res.text()}`);
  }
}

/**
 * On a held booking page: accept the terms, pay on the staging test-card page, and come back.
 * Test cards (mock gateway): 4242… succeeds, 4000 0000 0000 0002 is declined.
 */
export async function payWithTestCard(page: Page, card = '4242 4242 4242 4242') {
  const checkout = page.getByTestId('card-checkout');
  await checkout.getByRole('checkbox').check();
  await page.getByTestId('pay-button').click();
  await page.waitForURL(/\/pay\/test\/[0-9a-f-]{36}/);
  await page.locator('input[name="cardNumber"]').fill(card);
  await page.locator('input[name="expiry"]').fill('12/30');
  await page.locator('input[name="cvc"]').fill('123');
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL(/\/bookings\/[0-9a-f-]{36}/);
}
