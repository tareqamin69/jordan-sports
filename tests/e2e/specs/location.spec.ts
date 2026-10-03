import { expect, test } from '@playwright/test';
import { WEB } from './support';

test.describe('location first (on the device only)', () => {
  test('"later" offers governorates, and the choice is remembered', async ({ page }) => {
    await page.goto(`${WEB}/ar`);
    const card = page.getByTestId('location-card');
    await expect(card).toContainText('بدك نوريك الملاعب الأقرب عليك؟');
    await page.getByTestId('location-later').click();
    await expect(page.getByTestId('governorate-pick')).toBeVisible();
    await page.getByTestId('governorate-pick').getByRole('button', { name: 'عمّان' }).click();
    await expect(page.getByTestId('nearby')).toContainText('ملاعب عمّان');

    // Next visit: no question again, straight to the chosen governorate.
    await page.reload();
    await expect(page.getByTestId('nearby')).toContainText('ملاعب عمّان');
    await expect(page.getByTestId('location-card')).toHaveCount(0);
  });

  test('sharing the location shows the nearest venues and search sorts by distance', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      geolocation: { latitude: 31.9539, longitude: 35.9106 },
      permissions: ['geolocation'],
    });
    const page = await context.newPage();
    const posted: string[] = [];
    page.on('request', (r) => {
      if (r.url().includes('31.95') || (r.postData() ?? '').includes('31.95')) posted.push(r.url());
    });
    await page.goto(`${WEB}/en`);
    await page.getByTestId('use-location').click();
    const nearby = page.getByTestId('nearby');
    await expect(nearby).toContainText('Nearest to you');
    await expect(nearby.getByTestId('venue-card').first()).toContainText('km');

    await page.goto(`${WEB}/en/venues`);
    await expect(page.locator('select[name="sort"]')).toHaveValue('nearest');
    // The position never leaves the device.
    expect(posted).toEqual([]);
    await context.close();
  });
});
