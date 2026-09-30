import { expect, test } from '@playwright/test';
import {
  adminApi,
  arrangeVenue,
  createAdmin,
  latestOtp,
  makeBookable,
  payWithTestCard,
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
  test('a player books a time, pays by card, sees it in My bookings and cancels it for a refund', async ({
    page,
  }) => {
    const venue = await arrangeVenue(await adminApi(createAdmin()));
    await makeBookable(await userApi(venue.ownerPhone, 'Owner'), venue.venueId, venue.resourceId);

    // Signed out: choosing a time asks to sign in first and comes back to the venue.
    await page.goto(`${WEB}/en/venues/${venue.slug}`);
    await page.getByRole('group', { name: 'Date' }).getByRole('button').nth(1).click();
    await page.getByTestId('slot').getByRole('button').first().click();
    await page.getByTestId('book-selected').click();
    await expect(page).toHaveURL(/\/en\/sign-in\?next=/);
    const phone = randomPhone();
    await page.locator('input[name="phone"]').fill(phone);
    await page.locator('form button[type="submit"]').click();
    // The code screen says which number the code went to.
    await expect(page.getByText(/We sent a code to \+962\d{9}\./)).toBeVisible();
    await page.locator('input[name="code"]').fill(await latestOtp(phone));
    await page.locator('form button[type="submit"]').click();
    await page.locator('input[name="displayName"]').fill('Lina');
    await page.locator('input[name="ageConfirmed"]').check();
    await page.locator('form button[type="submit"]').click();
    await page.getByTestId('mode-player').click();
    // Back on the venue with the chosen day and time still highlighted.
    await expect(page).toHaveURL(
      new RegExp(`/en/venues/${venue.slug}\\?date=\\d{4}-\\d{2}-\\d{2}&time=\\d{2}(%3A|:)\\d{2}$`),
    );

    await page.getByRole('group', { name: 'Date' }).getByRole('button').nth(2).click();
    await page
      .getByRole('group', { name: 'Booking length' })
      .getByRole('button', { name: '60 min' })
      .click();
    const slot = page
      .getByTestId('slot')
      .getByRole('button')
      .filter({ hasText: /^10:00/ });
    await expect(slot).toContainText('JOD 20.000');
    await slot.click();
    await expect(page.getByTestId('booking-bar')).toContainText('JOD 20.000');
    await page.getByTestId('book-selected').click();
    await expect(page).toHaveURL(/\/en\/bookings\/[0-9a-f-]{36}$/);
    await expect(page.getByRole('heading', { name: 'Complete your booking' })).toBeVisible();
    await expect(page.getByTestId('hold-countdown')).toContainText(/9:\d\d|10:00/);
    await expect(page.getByTestId('booking-price')).toHaveText('JOD 20.000');
    await expectNoAccessibilityViolations(page);

    await expect(page.getByTestId('pay-button')).toBeDisabled();
    await expect(page.getByTestId('pay-button')).toContainText('Pay JOD 20.000');

    // A declined test card: back on the booking, still held, with the reason.
    await payWithTestCard(page, '4000 0000 0000 0002');
    await expect(page.getByTestId('payment-failed')).toContainText('declined');
    await expect(page.getByTestId('booking-status')).toHaveText('Awaiting payment');

    await payWithTestCard(page);
    await expect(page.getByText(/Your booking is confirmed and paid/)).toBeVisible();
    await expect(page.getByTestId('booking-paid')).toContainText('•••• 4242');
    // The banner belongs to this moment (?confirmed=1), not to later visits.
    await expect(page).toHaveURL(/\/bookings\/[0-9a-f-]{36}\?confirmed=1$/);
    await expect(page.getByTestId('booking-status')).toHaveText('Confirmed');
    const reference = (await page.getByTestId('booking-reference').textContent())?.trim();
    expect(reference).toMatch(/^[A-Z0-9]{8}$/);

    // The time is no longer offered to others.
    await page.goto(`${WEB}/en/venues/${venue.slug}`);
    await page.getByRole('group', { name: 'Date' }).getByRole('button').nth(2).click();
    await page
      .getByRole('group', { name: 'Booking length' })
      .getByRole('button', { name: '60 min' })
      .click();
    await expect(page.getByTestId('slot').filter({ hasText: /^10:00/ })).toHaveCount(0);
    await expect(page.getByTestId('slot').filter({ hasText: /^11:00/ })).toHaveCount(1);

    await page.getByTestId('bookings-link').click();
    await expect(page).toHaveURL(/\/en\/bookings$/);
    await expect(page.getByTestId('my-booking')).toHaveCount(1);
    await expect(page.getByTestId('my-booking')).toContainText('Confirmed');
    await page.getByTestId('my-booking').click();
    await expect(page.getByTestId('booking-status')).toHaveText('Confirmed');
    await expect(page.getByText(/Your booking is confirmed and paid/)).toHaveCount(0);
    await page.getByRole('button', { name: 'Cancel booking' }).click();
    // Two days ahead is inside the free-cancellation window: the full amount comes back.
    await expect(page.getByTestId('refund-preview')).toContainText('JOD 20.000');
    await page.getByRole('button', { name: 'Yes, cancel' }).click();
    await expect(page.getByTestId('booking-status')).toHaveText('Cancelled');
    await expect(page.getByTestId('booking-refund')).toContainText('JOD 20.000');
    // "Cancelled" appears once (the status badge), not again as a notice.
    await expect(page.getByText('Cancelled', { exact: true })).toHaveCount(1);

    // Admin: the declined attempt, the payment and the refund are in the gateway transactions.
    await signInAdmin(page, createAdmin());
    await page.goto(`${ADMIN}/en/payments`);
    await page.locator('input[name="transactionSearch"]').fill(reference!);
    await expect(page.getByTestId('transaction')).toHaveCount(3);
    await expect(page.getByTestId('transactions')).toContainText('Refund');
    await expect(page.getByTestId('transactions')).toContainText('card_declined');
    await expectNoAccessibilityViolations(page);
    await page.goto(`${ADMIN}/en/payouts`);
    await expect(page.getByRole('heading', { name: 'Venue payouts', level: 1 })).toBeVisible();
    await expectNoAccessibilityViolations(page);
  });

  test('a player releases a held time in Arabic', async ({ page }) => {
    const venue = await arrangeVenue(await adminApi(createAdmin()));
    await makeBookable(await userApi(venue.ownerPhone, 'Owner'), venue.venueId, venue.resourceId);
    await signUpPlayer(page, 'ar', 'سامي');
    await page.goto(`${WEB}/ar/venues/${venue.slug}`);
    await page.getByRole('group', { name: 'اليوم' }).getByRole('button').nth(1).click();
    await page
      .getByRole('group', { name: 'مدة الحجز' })
      .getByRole('button', { name: '60 دقيقة' })
      .click();
    await page
      .getByTestId('slot')
      .getByRole('button')
      .filter({ hasText: /^12:00/ })
      .click();
    await page.getByTestId('book-selected').click();
    await expect(page.getByRole('heading', { name: 'كمّل حجزك' })).toBeVisible();
    await expect(page.getByTestId('booking-price')).toHaveText('20.000 د.أ');
    await page.getByRole('button', { name: 'تراجع' }).click();
    await expect(page.getByText('تراجعت، والوقت صار فاضي لغيرك.')).toBeVisible();
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

    await page.locator('select[name="manualDate"]').selectOption(tomorrowInAmman());
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

    // The form only offers free times inside opening hours: 20:00 is taken now and no longer listed.
    const starts = page.locator('select[name="manualStart"] option');
    await expect(starts.filter({ hasText: '20:00' })).toHaveCount(0);
    await expect(starts.first()).not.toHaveText('06:00');

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
