import { expect, test } from '@playwright/test';
import {
  adminApi,
  arrangeVenue,
  createAdmin,
  makeBookable,
  signUpPlayer,
  userApi,
} from './helpers';
import { API, WEB, expectNoAccessibilityViolations } from './support';

test.describe('CliQ payments (plan §4–§5)', () => {
  // CliQ is built but switched off (FEATURE_CLIQ_PAYMENTS, ADR-0018): runs only against an API
  // started with the feature on.
  test.beforeEach(async ({ request }) => {
    const catalog = (await (await request.get(`${API}/v1/catalog`)).json()) as {
      features: { cliqPayments: boolean };
    };
    test.skip(!catalog.features.cliqPayments, 'CliQ payments are switched off');
  });

  test('player pays the deposit by CliQ, the venue confirms, the commission leaves the balance', async ({
    page,
    browser,
  }) => {
    const admin = await adminApi(createAdmin());
    const venue = await arrangeVenue(admin);
    const owner = await userApi(venue.ownerPhone, 'Owner');
    await makeBookable(owner, venue.venueId, venue.resourceId);
    const settings = await owner.patch(`/v1/manage/venues/${venue.venueId}`, {
      data: { cliqAlias: 'JORENA.PADEL', cliqAliasHolderName: 'Padel Club', depositPercentage: 25 },
    });
    expect(settings.ok(), await settings.text()).toBeTruthy();
    const { organizationId } = (await (
      await admin.get(`/v1/admin/venues/${venue.venueId}`)
    ).json()) as { organizationId: string };

    // Empty balance: a CliQ venue is not bookable online yet.
    const hidden = await page.request.get(`${API}/v1/venues/${venue.slug}`);
    expect(hidden.status()).toBe(404);
    const credit = await admin.post(
      `/v1/admin/organizations/${organizationId}/balance/adjustments`,
      {
        data: { amount: 20_000, reason: 'E2E top-up' },
      },
    );
    expect(credit.ok(), await credit.text()).toBeTruthy();

    // Player: pick a time, see the CliQ checkout, send the reference.
    await signUpPlayer(page, 'en', 'Lina');
    await page.goto(`${WEB}/en/venues/${venue.slug}`);
    await page.getByRole('group', { name: 'Date' }).getByRole('button').nth(1).click();
    await page
      .getByRole('group', { name: 'Booking length' })
      .getByRole('button', { name: '60 min' })
      .click();
    await page
      .getByTestId('slot')
      .getByRole('button')
      .filter({ hasText: /^10:00/ })
      .click();
    await expect(page).toHaveURL(/\/en\/bookings\/[0-9a-f-]{36}$/);
    const bookingUrl = page.url();
    await expect(page.getByTestId('cliq-due')).toHaveText('JOD 5.000');
    await expect(page.getByText('The remaining JOD 15.000 is paid at the venue.')).toBeVisible();
    await expect(page.getByTestId('cliq-alias')).toHaveText('JORENA.PADEL');
    await expect(page.getByTestId('hold-countdown')).toContainText(/2\d:\d\d|30:00/);
    await expectNoAccessibilityViolations(page);
    await page.getByLabel('CliQ transfer reference').fill('CLQ-E2E-0001');
    await page.getByRole('button', { name: 'I sent the transfer' }).click();
    await expect(page.getByTestId('cliq-awaiting')).toBeVisible();
    await expect(page.getByTestId('booking-status')).toHaveText('Waiting for the venue');

    // Venue: payments tab → "Payment arrived".
    // The owner's API session (already signed in above) drives the dashboard too.
    const venueContext = await browser.newContext({ storageState: await owner.storageState() });
    const venuePage = await venueContext.newPage();
    await venuePage.goto(`${WEB}/en/manage/${venue.venueId}?tab=payments`);
    const row = venuePage.getByTestId('payment-row');
    await expect(row).toContainText('Lina');
    await expect(row).toContainText('CLQ-E2E-0001');
    await expect(row).toContainText('JOD 5.000');
    await expectNoAccessibilityViolations(venuePage);
    await row.getByRole('button', { name: 'Payment arrived' }).click();
    await expect(
      venuePage.getByText('Booking confirmed; the commission was deducted from your balance.'),
    ).toBeVisible();
    await venuePage.goto(`${WEB}/en/manage/${venue.venueId}?tab=balance`);
    // 8% of JOD 20.000 = JOD 1.600 → 20.000 − 1.600.
    await expect(venuePage.getByTestId('balance-amount')).toHaveText('JOD 18.400');
    await expect(venuePage.getByText('Booking commission')).toBeVisible();
    await venueContext.close();

    // Player: the booking is confirmed on the next poll (or reload).
    await page.goto(bookingUrl);
    await expect(page.getByTestId('booking-status')).toHaveText('Confirmed');
    await expect(page.getByTestId('cliq-paid')).toHaveText(
      'You paid a JOD 5.000 deposit by CliQ; the remaining JOD 15.000 is paid at the venue.',
    );
  });
});
