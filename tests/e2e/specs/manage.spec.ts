import { expect, test } from '@playwright/test';
import { adminApi, arrangeVenue, createAdmin, signUpPlayer } from './helpers';
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

    await signUpPlayer(page, 'en', 'Venue Owner', venue.ownerPhone);
    await page.getByTestId('manage-link').click();
    await expect(page).toHaveURL(`${WEB}/en/manage`);
    await page.getByTestId('managed-venue').click();
    await expect(page.getByTestId('calendar-resource')).toContainText('Closed');

    // Opening hours: open every day (editor default 16:00–00:00).
    await page.getByRole('link', { name: 'Opening hours' }).click();
    for (const day of [6, 7, 1, 2, 3, 4, 5]) {
      await page.getByTestId(`hours-day-${day}`).getByRole('checkbox').check();
    }
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Opening hours saved.')).toBeVisible();

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
    await expect(page.getByText('لا تدير أي ملعب بعد.')).toBeVisible();
  });
});
