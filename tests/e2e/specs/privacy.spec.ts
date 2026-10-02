import { expect, test, type Page } from '@playwright/test';
import {
  adminApi,
  arrangeVenue,
  createAdmin,
  latestOtp,
  randomPhone,
  signUpPlayer,
} from './helpers';
import { expectNoAccessibilityViolations, WEB } from './support';

/** Requests the page made to any host other than our own (fonts, scripts, trackers, tiles…). */
function thirdPartyRequests(page: Page): string[] {
  const seen: string[] = [];
  page.on('request', (r) => {
    const { hostname, protocol } = new URL(r.url());
    if (protocol.startsWith('http') && hostname !== '127.0.0.1' && hostname !== 'localhost') {
      seen.push(r.url());
    }
  });
  return seen;
}

test.describe('privacy and legal (PDPL)', () => {
  test('sign-up needs the terms box; the offers box starts unticked', async ({ page }) => {
    const phone = randomPhone();
    await page.goto(`${WEB}/en/sign-in`);
    await page.locator('input[name="phone"]').fill(phone);
    await page.locator('form button[type="submit"]').click();
    await page.locator('input[name="code"]').fill(await latestOtp(phone));
    await page.locator('form button[type="submit"]').click();
    await page.locator('input[name="displayName"]').fill('Rami');
    await page.locator('input[name="ageConfirmed"]').check();
    await expect(page.locator('input[name="acceptTerms"]')).not.toBeChecked();
    await expect(page.locator('input[name="marketingOptIn"]')).not.toBeChecked();
    const submit = page.locator('form button[type="submit"]');
    await expect(submit).toBeDisabled();
    await page.locator('input[name="acceptTerms"]').check();
    await expect(submit).toBeEnabled();
  });

  test('a player can switch offers on and off and delete their account', async ({ page }) => {
    await signUpPlayer(page, 'en', 'Huda');
    await page.goto(`${WEB}/en/account`);
    const card = page.getByTestId('privacy-card');
    const offers = card.locator('input[name="marketingOptIn"]');
    await expect(offers).not.toBeChecked();
    await offers.check();
    await expect(offers).toBeChecked();
    await page.reload();
    await expect(
      page.getByTestId('privacy-card').locator('input[name="marketingOptIn"]'),
    ).toBeChecked();

    await page.getByTestId('delete-account').click();
    await page.getByTestId('confirm-delete-account').click();
    await expect(page).toHaveURL(`${WEB}/en`);
    await page.goto(`${WEB}/en/account`);
    await expect(page).toHaveURL(/\/en\/sign-in/);
  });

  test('legal pages are linked from the footer and readable in both languages', async ({
    page,
  }) => {
    await page.goto(`${WEB}/ar`);
    for (const path of ['/terms', '/privacy', '/refunds', '/cookies', '/venue-terms']) {
      await expect(page.locator(`footer a[href="/ar${path}"]`)).toHaveCount(1);
    }
    await page.goto(`${WEB}/ar/refunds`);
    await expect(page.getByTestId('legal-refunds')).toContainText('5–10');
    await expectNoAccessibilityViolations(page);
    await page.goto(`${WEB}/en/cookies`);
    await expect(page.getByTestId('legal-cookies')).toContainText('js_session');
    await page.goto(`${WEB}/en/privacy`);
    await expect(page.getByTestId('privacy-contact')).toBeVisible();
    await expectNoAccessibilityViolations(page);
  });

  test('pages load nothing from third parties until the map is opened', async ({ page }) => {
    const venue = await arrangeVenue(await adminApi(createAdmin()));
    const external = thirdPartyRequests(page);
    const response = await page.goto(`${WEB}/ar`);
    expect(response?.headers()['content-security-policy']).toContain("frame-ancestors 'none'");
    await page.goto(`${WEB}/ar/venues/${venue.slug}`);
    await page.goto(`${WEB}/ar/how-it-works`);
    await page.waitForLoadState('networkidle');
    expect(external).toEqual([]);
  });
});
