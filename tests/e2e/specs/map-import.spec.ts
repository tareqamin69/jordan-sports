import { expect, test } from '@playwright/test';
import { randomPhone, signUpPlayer } from './helpers';
import { WEB } from './support';

/**
 * Venue import from a Google Maps link (wizard step 1). Uses a full map URL so no network request
 * leaves the server (only short links are followed). Without a Places key only tier 1 applies.
 */
test('a Google Maps link pre-fills name, governorate and pin; a bad link never blocks', async ({
  page,
}) => {
  await signUpPlayer(page, 'en', 'Huda', randomPhone(), 'venue');
  await page.goto(`${WEB}/en/manage/register`);

  // A link we cannot read: a soft note, and the manual form is still there.
  const link = page.locator('input[name="mapLink"]');
  await link.fill('https://www.google.com/search?q=padel');
  await page.getByTestId('map-import-read').click();
  await expect(page.getByTestId('map-import-failed')).toBeVisible();
  await expect(page.locator('input[name="nameAr"]')).toBeEditable();

  await link.fill(
    'https://www.google.com/maps/place/%D9%86%D8%A7%D8%AF%D9%8A+%D8%A7%D9%84%D8%A8%D8%A7%D8%AF%D9%84/@31.95,35.90,15z/data=!4m6!3m5!1s0x0:0x1!8m2!3d31.9539!4d35.9106',
  );
  await page.getByTestId('map-import-read').click();
  await expect(page.getByTestId('map-import-done')).toContainText('upload your own');
  await expect(page.locator('input[name="nameAr"]')).toHaveValue('نادي البادل');
  await expect(page.locator('select[name="governorateId"] option:checked')).toHaveText('Amman');

  await page.locator('input[name="contactPhone"]').fill('0791234567');
  await page.getByRole('button', { name: 'Next' }).click();
  // The pin from the link is already set on the location step.
  await expect(page.getByText('The location is set on the map.')).toBeVisible();
});
