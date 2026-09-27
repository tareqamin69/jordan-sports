import { expect, test } from '@playwright/test';
import {
  adminApi,
  arrangeVenue,
  createAdmin,
  latestOtp,
  makeBookable,
  randomPhone,
  signInAdmin,
  signInExisting,
  signUpPlayer,
  userApi,
} from './helpers';
import { ADMIN, WEB, expectNoAccessibilityViolations } from './support';

function tomorrowInAmman(): string {
  const now = new Date(Date.now() + 24 * 3_600_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Amman' }).format(now);
}

test.describe('bookings', () => {
  test('a player books a time, confirms, sees it in My bookings and cancels it', async ({
    page,
  }) => {
    const venue = await arrangeVenue(await adminApi(createAdmin()));
    await makeBookable(await userApi(venue.ownerPhone, 'Owner'), venue.venueId, venue.resourceId);

    // Signed out: choosing a time asks to sign in first and comes back to the venue.
    await page.goto(`${WEB}/en/venues/${venue.slug}`);
    await page.getByRole('group', { name: 'Date' }).getByRole('button').nth(1).click();
    await page.getByTestId('slot').getByRole('button').first().click();
    await expect(page).toHaveURL(/\/en\/sign-in\?next=/);
    const phone = randomPhone();
    await page.locator('input[name="phone"]').fill(phone);
    await page.locator('form button[type="submit"]').click();
    await page.locator('input[name="code"]').fill(await latestOtp(phone));
    await page.locator('form button[type="submit"]').click();
    await page.locator('input[name="displayName"]').fill('Lina');
    await page.locator('input[name="ageConfirmed"]').check();
    await page.locator('form button[type="submit"]').click();
    await expect(page).toHaveURL(new RegExp(`/en/venues/${venue.slug}$`));

    await page.getByRole('group', { name: 'Date' }).getByRole('button').nth(1).click();
    const slot = page.getByTestId('slot').getByRole('button').filter({ hasText: '10:00–11:00' });
    await expect(slot).toContainText('JOD 20.000');
    await slot.click();
    await expect(page).toHaveURL(/\/en\/bookings\/[0-9a-f-]{36}$/);
    await expect(page.getByRole('heading', { name: 'Complete your booking' })).toBeVisible();
    await expect(page.getByTestId('hold-countdown')).toContainText(/9:\d\d|10:00/);
    await expect(page.getByTestId('booking-price')).toHaveText('JOD 20.000');
    await expectNoAccessibilityViolations(page);

    const confirm = page.getByRole('button', { name: 'Confirm booking' });
    await expect(confirm).toBeDisabled();
    await page.getByLabel('I will pay at the venue and I accept the cancellation terms.').check();
    await confirm.click();
    await expect(page.getByText('Your booking is confirmed.')).toBeVisible();
    await expect(page.getByTestId('booking-status')).toHaveText('Confirmed');
    const reference = (await page.getByTestId('booking-reference').textContent())?.trim();
    expect(reference).toMatch(/^[A-Z0-9]{8}$/);

    // The time is no longer offered to others.
    await page.goto(`${WEB}/en/venues/${venue.slug}`);
    await page.getByRole('group', { name: 'Date' }).getByRole('button').nth(1).click();
    await expect(page.getByTestId('slot').filter({ hasText: '10:00–11:00' })).toContainText(
      'Booked',
    );

    await page.getByTestId('bookings-link').click();
    await expect(page).toHaveURL(/\/en\/bookings$/);
    await expect(page.getByTestId('my-booking')).toHaveCount(1);
    await expect(page.getByTestId('my-booking')).toContainText('Confirmed');
    await page.getByTestId('my-booking').click();
    await page.getByRole('button', { name: 'Cancel booking' }).click();
    await page.getByRole('button', { name: 'Yes, cancel' }).click();
    await expect(page.getByTestId('booking-status')).toHaveText('Cancelled');
  });

  test('a player releases a held time in Arabic', async ({ page }) => {
    const venue = await arrangeVenue(await adminApi(createAdmin()));
    await makeBookable(await userApi(venue.ownerPhone, 'Owner'), venue.venueId, venue.resourceId);
    await signUpPlayer(page, 'ar', 'سامي');
    await page.goto(`${WEB}/ar/venues/${venue.slug}`);
    await page.getByRole('group', { name: 'التاريخ' }).getByRole('button').nth(1).click();
    await page.getByTestId('slot').getByRole('button').filter({ hasText: '12:00–13:00' }).click();
    await expect(page.getByRole('heading', { name: 'أكمل حجزك' })).toBeVisible();
    await expect(page.getByTestId('booking-price')).toHaveText('20.000 د.أ');
    await page.getByRole('button', { name: 'إلغاء حجز الوقت' }).click();
    await expect(page.getByText('تم إلغاء حجز الوقت.')).toBeVisible();
    await expect(page.getByTestId('booking-status')).toHaveText('ملغي');
  });

  test('a venue adds a weekly phone booking, sees it in the list, and admins see bookings', async ({
    page,
  }) => {
    const venue = await arrangeVenue(await adminApi(createAdmin()));
    await makeBookable(await userApi(venue.ownerPhone, 'Owner'), venue.venueId, venue.resourceId);
    await signInExisting(page, 'en', venue.ownerPhone);
    await page.goto(`${WEB}/en/manage/${venue.venueId}?tab=bookings`);
    await expect(page.getByText('No bookings in this period.')).toBeVisible();

    await page.locator('input[name="manualDate"]').fill(tomorrowInAmman());
    await page.locator('select[name="manualStart"]').selectOption({ label: '20:00' });
    await page.locator('input[name="manualName"]').fill('Team Falcons');
    await page.locator('input[name="manualPhone"]').fill('0791234567');
    await page.locator('select[name="manualWeeks"]').selectOption({ label: '4 weeks' });
    await page.getByRole('button', { name: 'Add booking' }).click();
    await expect(page.getByText('4 bookings added.')).toBeVisible();
    await expect(page.getByTestId('venue-booking').first()).toContainText('Team Falcons');
    await expect(page.getByTestId('venue-booking').first()).toContainText('+962791234567');
    await expect(page.getByTestId('venue-booking').first()).toContainText('Weekly');
    await expect(page.getByTestId('venue-booking')).toHaveCount(2);

    // Same time again: taken.
    await page.locator('input[name="manualName"]').fill('Walk-in');
    await page.getByRole('button', { name: 'Add booking' }).click();
    await expect(page.getByText('Sorry, this time was just taken.')).toBeVisible();

    // Cancel one with a reason.
    const first = page.getByTestId('venue-booking').first();
    await first.getByRole('button', { name: 'Cancel booking' }).click();
    await first.locator('input[name="cancelReason"]').fill('Team asked to skip');
    await first.getByRole('button', { name: 'Confirm cancellation' }).click();
    await expect(page.getByTestId('venue-booking').first()).toContainText('Cancelled');

    // A second staff account: authenticator codes cannot be reused within the same 30 seconds.
    await signInAdmin(page, createAdmin());
    await page.goto(`${ADMIN}/en/bookings`);
    await expect(page.getByTestId('admin-booking').first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Bookings' })).toBeVisible();
  });
});
