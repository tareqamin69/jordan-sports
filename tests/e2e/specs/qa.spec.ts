import { expect, test } from '@playwright/test';
import { adminApi, arrangeVenue, createAdmin, signUpPlayer } from './helpers';
import { API, WEB } from './support';

/** Regression checks for the QA pass on staging. */
test.describe('QA fixes', () => {
  test('contact page has no made-up WhatsApp number; terms and privacy show no placeholder notice', async ({
    page,
  }) => {
    await page.goto(`${WEB}/en/contact`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByText('The fastest way to reach us.')).toHaveCount(0);
    await expect(page.locator('a[href*="wa.me/962700000000"]')).toHaveCount(0);
    for (const path of ['terms', 'privacy']) {
      await page.goto(`${WEB}/en/${path}`);
      await expect(page.getByText(/placeholder/i)).toHaveCount(0);
    }
  });

  test('every active sport is offered, and a sport without venues invites registration', async ({
    page,
    request,
  }) => {
    const catalog = (await (await request.get(`${API}/v1/catalog`)).json()) as {
      sports: Array<{ id: string; key: string }>;
      offeredSportIds: string[];
    };
    // Home shows only sports with an approved venue; /sports shows every one (the empty ones as
    // muted "register your venue" tiles).
    await page.goto(`${WEB}/en`);
    await expect(
      page.locator('section[aria-labelledby="sports-heading"] a[href*="sport="]'),
    ).toHaveCount(catalog.offeredSportIds.length);
    await page.goto(`${WEB}/en/sports`);
    await expect(page.getByTestId('sport-tile')).toHaveCount(catalog.offeredSportIds.length);
    await expect(page.getByTestId('sport-tile-empty')).toHaveCount(
      catalog.sports.length - catalog.offeredSportIds.length,
    );

    const empty = catalog.sports.find((s) => !catalog.offeredSportIds.includes(s.id));
    if (empty) {
      await page.goto(`${WEB}/en/venues?sport=${empty.key}`);
      const box = page.getByTestId('venues-empty');
      await expect(box).toContainText('no venues for this sport yet');
      await box.getByRole('link', { name: 'Register your venue' }).click();
      await expect(page).toHaveURL(/\/en\/manage\/register/);
    }
  });

  test('venue owner: front desk is the default role and owner needs a confirmation; nav links go to their own tabs', async ({
    page,
  }) => {
    const venue = await arrangeVenue(await adminApi(createAdmin()));
    await signUpPlayer(page, 'en', 'Venue Owner', venue.ownerPhone, 'venue');
    await page.getByTestId('managed-venue').click();

    const nav = page.getByRole('navigation', { name: 'Venue dashboard navigation' });
    const hrefs = await nav
      .getByRole('link')
      .evaluateAll((els) => els.map((e) => e.getAttribute('href')));
    expect(hrefs.some((h) => h?.includes('tab=today'))).toBe(true);
    expect(hrefs.some((h) => h?.includes('tab=bookings'))).toBe(true);
    expect(hrefs.some((h) => h?.includes('tab=settings'))).toBe(true);
    expect(new Set(hrefs).size).toBe(hrefs.length);

    await page.getByRole('link', { name: 'Team', exact: true }).click();
    const role = page.locator('select[name="memberRole"]');
    await expect(role).toHaveValue('staff');
    await role.selectOption('owner');
    const add = page.getByRole('button', { name: 'Add', exact: true });
    await expect(add).toBeDisabled();
    await page.getByLabel('I am sure I want to give them the owner role').check();
    await expect(add).toBeEnabled();
  });
});
