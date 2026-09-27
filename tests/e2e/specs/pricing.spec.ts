import { expect, test } from '@playwright/test';
import { adminApi, arrangeVenue, createAdmin, signUpPlayer } from './helpers';
import { WEB } from './support';

test.describe('pricing', () => {
  test('an owner sets a price band, previews it, and players see the price on the venue page', async ({
    page,
  }) => {
    const venue = await arrangeVenue(await adminApi(createAdmin()));
    await signUpPlayer(page, 'en', 'Owner', venue.ownerPhone);
    await page.goto(`${WEB}/en/manage/${venue.venueId}?tab=hours`);
    for (const day of [6, 7, 1, 2, 3, 4, 5]) {
      await page.getByTestId(`hours-day-${day}`).getByRole('checkbox').check();
    }
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Opening hours saved.')).toBeVisible();

    // Before prices, players see no bookable times.
    await page.goto(`${WEB}/en/venues/${venue.slug}`);
    await expect(page.getByText('No available times on this day.')).toBeVisible();

    await page.goto(`${WEB}/en/manage/${venue.venueId}?tab=pricing`);
    await expect(page.getByText('No prices yet.')).toBeVisible();
    await page.locator('input[name="price-90"]').fill('abc');
    await page.getByRole('button', { name: 'Add price band' }).click();
    await expect(page.getByText('Enter a price such as 25 or 25.500.')).toBeVisible();
    await page.locator('input[name="price-90"]').fill('25');
    await page.locator('input[name="bandLabel"]').fill('Standard');
    await page.getByRole('button', { name: 'Add price band' }).click();
    await expect(page.getByTestId('price-rules')).toContainText('JOD 25.000');

    await page.locator('select[name="previewStart"]').selectOption({ label: '18:00' });
    await page.getByRole('button', { name: 'Check price' }).click();
    await expect(page.getByTestId('price-preview')).toHaveText('Price: JOD 25.000');

    // Public venue page (tomorrow) shows the price in English and Arabic formats.
    await page.goto(`${WEB}/en/venues/${venue.slug}`);
    await page.getByRole('group', { name: 'Date' }).getByRole('button').nth(1).click();
    await expect(page.getByTestId('slot').first()).toContainText('JOD 25.000');
    await page.goto(`${WEB}/ar/venues/${venue.slug}`);
    await page.getByRole('group', { name: 'اليوم' }).getByRole('button').nth(1).click();
    await expect(page.getByTestId('slot').first()).toContainText('25.000 د.أ');
  });
});
