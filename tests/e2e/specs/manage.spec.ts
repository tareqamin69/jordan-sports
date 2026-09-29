import { expect, test } from '@playwright/test';
import { adminApi, arrangeVenue, createAdmin, randomPhone, signUpPlayer, userApi } from './helpers';
import { API, expectNoAccessibilityViolations, WEB } from './support';

function ammanDate(offsetDays: number): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000 - 6 * 3_600_000);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Amman',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

test.describe('venue dashboard (/manage)', () => {
  test('an owner sets opening hours and blocks a phone booking; the website loses the slot immediately', async ({
    page,
  }) => {
    const api = await adminApi(createAdmin());
    const venue = await arrangeVenue(api);

    await signUpPlayer(page, 'en', 'Venue Owner', venue.ownerPhone, 'venue');
    await page.getByTestId('managed-venue').click();
    // The dashboard opens on Today; the calendar tab asks for them first (with a link to the editor).
    await page.getByRole('link', { name: 'Calendar', exact: true }).click();
    await expect(page.getByText('Set opening hours first')).toBeVisible();

    // Opening hours: open every day (editor default 16:00–00:00).
    await page.getByRole('link', { name: 'Opening hours', exact: true }).click();
    for (const day of [6, 7, 1, 2, 3, 4, 5]) {
      await page.getByTestId(`hours-day-${day}`).getByRole('checkbox').check();
    }
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Opening hours saved.')).toBeVisible();

    // A price, so the times are offered publicly.
    await page.getByRole('link', { name: 'Prices', exact: true }).click();
    await page.locator('input[name="price-90"]').fill('20');
    await page.getByRole('button', { name: 'Add price band' }).click();
    await expect(page.getByTestId('price-rules')).toContainText('JOD 20.000');

    // Block tomorrow 18:00–19:00 (a booking taken by phone).
    await page.getByRole('link', { name: 'Calendar' }).click();
    await page.getByRole('button', { name: 'Next day' }).click();
    await page.locator('select[name="blockStart"]').selectOption({ label: '18:00' });
    await page.locator('input[name="blockNote"]').fill('Phone booking: Rami');
    await page.getByRole('button', { name: 'Block this time' }).click();
    await expect(page.getByTestId('calendar-entry')).toContainText('Phone booking: Rami');
    await expectNoAccessibilityViolations(page);

    const tomorrow = ammanDate(1);
    const availability = async () => {
      const res = await page.request.get(
        `${API}/v1/venues/${venue.slug}/availability?date=${tomorrow}`,
      );
      const body = (await res.json()) as {
        resources: Array<{
          slots: Array<{ localStart: string; available: boolean; durationMinutes: number }>;
        }>;
      };
      return body.resources[0]!.slots.filter((s) => s.localStart === '18:00');
    };
    expect((await availability()).every((s) => !s.available)).toBe(true);

    // Remove the block: the slot is bookable again.
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Remove block' }).click();
    await expect(page.getByTestId('calendar-entry')).toHaveCount(0);
    expect((await availability()).some((s) => s.available)).toBe(true);
  });

  test('a signed-in player without memberships sees no venues', async ({ page }) => {
    await signUpPlayer(page, 'ar', 'لاعب');
    await page.goto(`${WEB}/ar/manage`);
    await expect(page.getByText('ما عندك ملاعب لسا.')).toBeVisible();
  });

  test('the owner adds front-desk staff by phone; staff see only their tabs', async ({ page }) => {
    const venue = await arrangeVenue(await adminApi(createAdmin()));
    const owner = await userApi(venue.ownerPhone, 'Owner');
    const staffPhone = randomPhone();
    const added = await owner.post(`/v1/manage/venues/${venue.venueId}/team`, {
      data: { phone: staffPhone, displayName: 'Front desk', role: 'staff' },
    });
    expect(added.status()).toBe(201);

    await signUpPlayer(page, 'en', 'Front desk', staffPhone, 'venue');
    await page.getByTestId('managed-venue').click();
    const tabs = page.getByRole('navigation', { name: 'Venue dashboard sections' });
    await expect(tabs.getByRole('link', { name: 'Today', exact: true })).toBeVisible();
    await expect(tabs.getByRole('link', { name: 'Calendar', exact: true })).toBeVisible();
    for (const hidden of ['Prices', 'Team', 'Reports', 'Opening hours', 'Venue settings']) {
      await expect(tabs.getByRole('link', { name: hidden, exact: true })).toHaveCount(0);
    }
    // An old link to a tab the role can't use falls back to the calendar.
    await page.goto(`${WEB}/en/manage/${venue.venueId}?tab=team`);
    await expect(page.getByTestId('team-panel')).toHaveCount(0);
  });
});
