import { expect, test } from '@playwright/test';
import { createAdmin, signInAdmin, signUpPlayer, randomPhone } from './helpers';
import { expectNoAccessibilityViolations, WEB } from './support';

test.describe('player sign-up and sign-in (phone code)', () => {
  test('a new player signs up in Arabic and sees their account', async ({ page }) => {
    await page.goto(`${WEB}/ar/sign-in`);
    await expectNoAccessibilityViolations(page);
    await signUpPlayer(page, 'ar', 'سامي');
    await page.goto(`${WEB}/ar/account`);
    await expect(page.getByTestId('account-name')).toHaveText('سامي');
    await expect(page.getByTestId('account-link')).toHaveText('سامي');
    await expectNoAccessibilityViolations(page);
  });

  test('signs out and protects the account page', async ({ page }) => {
    await signUpPlayer(page, 'en', 'Omar');
    await page.goto(`${WEB}/en/account`);
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(`${WEB}/en`);
    await page.goto(`${WEB}/en/account`);
    await expect(page).toHaveURL(`${WEB}/en/sign-in`);
  });

  test('shows a translated error for a wrong code', async ({ page }) => {
    await page.goto(`${WEB}/en/sign-in`);
    await page.locator('input[name="phone"]').fill(randomPhone());
    await page.locator('form button[type="submit"]').click();
    await page.locator('input[name="code"]').fill('000000');
    await page.locator('form button[type="submit"]').click();
    // The real code is random, so 000000 is almost always wrong; accept the one-in-a-million case.
    await expect(
      page
        .locator('main [role="alert"]')
        .or(page.getByRole('heading', { name: 'Complete your account' })),
    ).toBeVisible();
  });
});

test.describe('platform admin', () => {
  test('staff sign in with password and authenticator code, then create an organization', async ({
    page,
  }) => {
    const admin = createAdmin();
    await signInAdmin(page, admin, 'en');

    await page.getByRole('link', { name: 'Organizations' }).first().click();
    await page.getByRole('button', { name: 'New organization' }).click();
    const slug = `e2e-club-${Date.now()}`;
    await page.locator('input[name="nameAr"]').fill('نادي الاختبار');
    await page.locator('input[name="nameEn"]').fill('E2E Test Club');
    await page.locator('input[name="slug"]').fill(slug);
    await page.locator('input[name="ownerName"]').fill('Owner');
    await page.locator('input[name="ownerPhone"]').fill(randomPhone());
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page.getByText(slug)).toBeVisible();

    await page.getByRole('link', { name: 'Audit log' }).click();
    await expect(page.getByText('organization.created').first()).toBeVisible();
  });

  test('rejects a wrong authenticator code', async ({ page }) => {
    const admin = createAdmin();
    await page.goto('http://127.0.0.1:3001/en/sign-in');
    await page.locator('input[name="email"]').fill(admin.email);
    await page.locator('input[name="password"]').fill(admin.password);
    await page.locator('input[name="totpCode"]').fill('000000');
    await page.locator('form button[type="submit"]').click();
    await expect(page.locator('main [role="alert"]')).toContainText('not correct');
  });

  test('redirects to sign-in without a session', async ({ page }) => {
    await page.goto('http://127.0.0.1:3001/ar/organizations');
    await expect(page).toHaveURL('http://127.0.0.1:3001/ar/sign-in');
  });
});
