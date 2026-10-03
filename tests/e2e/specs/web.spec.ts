import { expect, test } from '@playwright/test';
import {
  ARABIC,
  expectDocumentLocale,
  expectHeaderDirection,
  expectNoAccessibilityViolations,
  WEB,
} from './support';

test.describe('web (marketplace) skeleton', () => {
  test('/ redirects to Arabic, the default locale', async ({ page }) => {
    await page.goto(`${WEB}/`);
    await expect(page).toHaveURL(`${WEB}/ar`);
    await expectDocumentLocale(page, 'ar');
  });

  test('ignores an English Accept-Language header (no automatic detection)', async ({
    browser,
  }) => {
    const context = await browser.newContext({ locale: 'en-US' });
    const page = await context.newPage();
    await page.goto(`${WEB}/`);
    await expect(page).toHaveURL(`${WEB}/ar`);
    await context.close();
  });

  test('renders Arabic right-to-left', async ({ page }) => {
    await page.goto(`${WEB}/ar`);
    await expectDocumentLocale(page, 'ar');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(ARABIC);
    await expect(page).toHaveTitle(ARABIC);
    await expectHeaderDirection(page, 'rtl');
    await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveAttribute(
      'href',
      /\/en$/,
    );
  });

  test('renders English left-to-right', async ({ page }) => {
    await page.goto(`${WEB}/en`);
    await expectDocumentLocale(page, 'en');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      /Your game\. Your time\.\s*Your court\./,
    );
    await expectHeaderDirection(page, 'ltr');
  });

  test('the home page offers a venue search and no outdated banners', async ({ page }) => {
    await page.goto(`${WEB}/en`);
    await expect(page.getByRole('search')).toBeVisible();
    await expect(page.getByText(/not available|coming soon|call the venue/i)).toHaveCount(0);
    await page.getByRole('search').getByLabel('Day').selectOption({ index: 2 });
    await page.getByRole('button', { name: 'Search' }).click();
    await expect(page).toHaveURL(/\/en\/venues\?.*date=\d{4}-\d{2}-\d{2}/);
  });

  test('switches language in both directions', async ({ page }) => {
    await page.goto(`${WEB}/ar`);
    await page.getByTestId('locale-switcher').click();
    await expect(page).toHaveURL(`${WEB}/en`);
    await expectDocumentLocale(page, 'en');
    await page.getByTestId('locale-switcher').click();
    await expect(page).toHaveURL(`${WEB}/ar`);
    await expectDocumentLocale(page, 'ar');
  });

  test('shows a localized 404 for unknown pages', async ({ page }) => {
    const response = await page.goto(`${WEB}/ar/no-such-page`);
    expect(response?.status()).toBe(404);
    await expectDocumentLocale(page, 'ar');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('الصفحة مش موجودة');
  });

  for (const locale of ['ar', 'en'] as const) {
    test(`has no automatically detectable accessibility violations (${locale})`, async ({
      page,
    }) => {
      await page.goto(`${WEB}/${locale}`);
      await expectNoAccessibilityViolations(page);
    });
  }
});
