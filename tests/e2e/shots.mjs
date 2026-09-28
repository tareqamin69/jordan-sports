// Screenshot tour (mobile, Arabic) against the demo database. Usage: node shots.mjs <prefix>
import { chromium, devices, request } from '@playwright/test';
const OUT = process.env.SHOTS_DIR;
const prefix = process.argv[2] ?? 'shot';
const WEB = 'http://127.0.0.1:3000';
async function session(phone, name) {
  const api = await request.newContext({
    baseURL: 'http://127.0.0.1:4000',
    extraHTTPHeaders: { origin: WEB },
  });
  await api.post('/v1/auth/otp/request', { data: { phone } });
  const { code } = await (await api.get(`/v1/dev/otp?phone=${encodeURIComponent(phone)}`)).json();
  const v = await (await api.post('/v1/auth/otp/verify', { data: { phone, code } })).json();
  if (v.status !== 'signed_in')
    await api.post('/v1/auth/signup', {
      data: {
        signupToken: v.signupToken,
        displayName: name,
        locale: 'ar',
        ageConfirmed: true,
        preferredMode: 'player',
      },
    });
  return api.storageState();
}
const browser = await chromium.launch();
const shot = async (page, name) => {
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/${prefix}-${name}.png`, fullPage: true });
  console.log(name);
};
const guest = await browser.newContext({ ...devices['Pixel 7'], locale: 'ar' });
let page = await guest.newPage();
await page.goto(`${WEB}/ar`);
await shot(page, '01-home');
await page.goto(`${WEB}/ar/venues/demo-padel-club`);
await shot(page, '02-venue');
const player = await browser.newContext({
  ...devices['Pixel 7'],
  locale: 'ar',
  storageState: await session(process.env.PLAYER_PHONE ?? '0790000002', 'لينا'),
});
page = await player.newPage();
await page.goto(`${WEB}/ar/venues/demo-padel-club`);
const days = page.getByRole('group').first().getByRole('button');
await days.nth(1).click();
await page.waitForTimeout(800);
const slot = page.getByTestId('slot').getByRole('button').first();
if (await slot.count()) {
  await slot.click();
  await page.waitForURL(/bookings\//);
  await shot(page, '03-checkout');
  await page.getByRole('checkbox').check();
  await page
    .getByRole('button')
    .filter({ hasText: /تأكيد|أكّد|أكد/ })
    .first()
    .click();
  await page.waitForTimeout(1500);
  await shot(page, '04-confirmed');
}
await page.goto(`${WEB}/ar/bookings`);
await shot(page, '05-my-bookings');
const owner = await browser.newContext({
  ...devices['Pixel 7'],
  locale: 'ar',
  storageState: await session('0790000001', 'صاحب الملعب'),
});
page = await owner.newPage();
await page.goto(`${WEB}/ar/manage`);
await page.waitForTimeout(800);
const link = page.locator('a[href*="/manage/"]').first();
const href = await link.getAttribute('href');
await page.goto(`${WEB}${href}`);
await shot(page, '06-calendar');
await page.goto(`${WEB}${href}?tab=pricing`);
await shot(page, '07-pricing');
await page.goto(`${WEB}${href}?tab=bookings`);
await shot(page, '08-venue-bookings');
await browser.close();
