import { expect, test } from '@playwright/test';
import {
  ADMIN,
  ARABIC,
  expectDocumentLocale,
  expectHeaderDirection,
  expectNoAccessibilityViolations,
} from './support';
import { setUpOwner, totp } from './helpers';

test.describe('admin skeleton', () => {
  test('/ redirects to Arabic and asks staff to sign in', async ({ page }) => {
    await page.goto(`${ADMIN}/`);
    await expect(page).toHaveURL(`${ADMIN}/ar/sign-in`);
  });

  test('renders Arabic right-to-left', async ({ page }) => {
    await page.goto(`${ADMIN}/ar/sign-in`);
    await expectDocumentLocale(page, 'ar');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(ARABIC);
    await expectHeaderDirection(page, 'rtl');
  });

  test('renders English left-to-right', async ({ page }) => {
    await page.goto(`${ADMIN}/en/sign-in`);
    await expectDocumentLocale(page, 'en');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Staff sign-in');
    await expectHeaderDirection(page, 'ltr');
  });

  test('is never indexable by search engines', async ({ page }) => {
    await page.goto(`${ADMIN}/en/sign-in`);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  });

  test('switches language', async ({ page }) => {
    await page.goto(`${ADMIN}/ar/sign-in`);
    await page.getByTestId('locale-switcher').click();
    await expect(page).toHaveURL(`${ADMIN}/en/sign-in`);
    await expectDocumentLocale(page, 'en');
  });

  for (const locale of ['ar', 'en'] as const) {
    test(`has no automatically detectable accessibility violations (${locale})`, async ({
      page,
    }) => {
      await page.goto(`${ADMIN}/${locale}/sign-in`);
      await expectNoAccessibilityViolations(page);
    });
  }
});

// There is only one owner: flows that set it up run one at a time, in one browser project.
test.describe('owner account setup', () => {
  test.describe.configure({ mode: 'serial' });
  test.skip(({ isMobile }) => isMobile, 'one owner: runs in the desktop project only');

  test('the owner chooses a password and enrols an authenticator from a one-time link', async ({
    page,
  }) => {
    await setUpOwner(page, 'ar');
    await expect(page.getByRole('navigation', { name: 'الإدارة' })).toBeVisible();
    // The link is spent and gone from the address bar.
    expect(page.url()).not.toContain('token=');
  });

  test('an incomplete link explains what to do', async ({ page }) => {
    await page.goto(`${ADMIN}/en/setup`);
    await expect(page.getByText('The link is incomplete.')).toBeVisible();
  });

  test('the owner invites a support member, who sees only their own sections', async ({
    page,
    browser,
  }) => {
    await setUpOwner(page, 'en');
    await page.getByRole('link', { name: 'Admin team' }).click();
    const email = `e2e-support-${Date.now()}@example.com`;
    await page.locator('input[name="inviteEmail"]').fill(email);
    await page.locator('select[name="inviteRole"]').selectOption('support');
    await page.getByTestId('invite-form').getByRole('button').click();
    const link = (await page.getByTestId('invite-link').locator('code').textContent())!.trim();

    const context = await browser.newContext();
    const invited = await context.newPage();
    await invited.goto(link.replace('localhost', '127.0.0.1'));
    const secret = (await invited.getByTestId('totp-secret').textContent())!.trim();
    await invited.locator('input[name="displayName"]').fill('E2E Support');
    await invited.locator('input[name="password"]').fill('e2e support password');
    await invited.locator('input[name="confirm"]').fill('e2e support password');
    await invited.locator('input[name="totpCode"]').fill(totp(secret));
    await invited.locator('form button[type="submit"]').click();
    const nav = invited.getByRole('navigation', { name: 'Administration' });
    await expect(nav.getByRole('link', { name: 'Bookings' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Admin team' })).toHaveCount(0);
    await expect(nav.getByRole('link', { name: 'Settings' })).toHaveCount(0);
    await context.close();

    await page.reload();
    await expect(page.getByTestId('team-members')).toContainText(email);
  });
});
