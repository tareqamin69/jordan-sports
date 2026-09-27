import { expect, test } from '@playwright/test';
import {
  ADMIN,
  ARABIC,
  expectDocumentLocale,
  expectHeaderDirection,
  expectNoAccessibilityViolations,
} from './support';

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
