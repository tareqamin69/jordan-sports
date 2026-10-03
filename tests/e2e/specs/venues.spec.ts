import { expect, test } from '@playwright/test';
import {
  adminApi,
  arrangeVenue,
  createAdmin,
  makeBookable,
  randomPhone,
  signInAdmin,
  userApi,
} from './helpers';
import { ADMIN, expectNoAccessibilityViolations, WEB } from './support';

test.describe('venues: admin onboarding → public page', () => {
  test('an admin creates, configures and approves a venue that then appears publicly in both languages', async ({
    page,
  }) => {
    const admin = createAdmin();
    await signInAdmin(page, admin, 'en');

    // Organization.
    await page.goto(`${ADMIN}/en/organizations`);
    await page.getByRole('button', { name: 'New organization' }).click();
    const suffix = `${Date.now()}`;
    await page.locator('input[name="nameAr"]').fill('مجموعة الاختبار');
    await page.locator('input[name="nameEn"]').fill(`E2E Group ${suffix}`);
    await page.locator('input[name="slug"]').fill(`e2e-group-${suffix}`);
    await page.locator('input[name="ownerName"]').fill('Owner');
    await page.locator('input[name="ownerPhone"]').fill(randomPhone());
    await page.getByRole('button', { name: 'Create' }).click();
    await page.getByRole('link', { name: new RegExp(`E2E Group ${suffix}`) }).click();

    // Venue.
    await page.getByRole('button', { name: 'New venue' }).click();
    const slug = `e2e-padel-${suffix}`;
    await page.locator('input[name="venueNameAr"]').fill('نادي البادل التجريبي');
    await page.locator('input[name="venueNameEn"]').fill('E2E Padel Club');
    await page.locator('input[name="venueSlug"]').fill(slug);
    await page.locator('select[name="areaId"]').selectOption({ label: 'Sweifieh' });
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page.getByTestId('venue-status')).toHaveText('Draft');

    // Resource: padel court with attributes.
    await page.getByRole('button', { name: 'Add a court' }).click();
    await page.locator('select[name="resourceType"]').selectOption({ label: 'Padel court' });
    await page.locator('input[name="resourceNameAr"]').fill('ملعب 1');
    await page.locator('input[name="resourceNameEn"]').fill('Court 1');
    await page.getByLabel('Padel · Doubles').check();
    await page.getByLabel('Panoramic glass').check();
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page.getByTestId('resource-list')).toContainText('Court 1');

    // Draft venues are not public.
    const hidden = await page.request.get(`${WEB}/en/venues/${slug}`);
    expect(hidden.status()).toBe(404);

    // Approve.
    await page.locator('input[name="statusReason"]').fill('Verified on site');
    await page.getByRole('button', { name: 'Approve and publish' }).click();
    await expect(page.getByTestId('venue-status')).toHaveText('Approved (public)');

    // Public page in Arabic (default) and English.
    await page.goto(`${WEB}/ar/venues/${slug}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('نادي البادل التجريبي');
    await expect(page.getByTestId('venue-resource')).toContainText('زجاج بانورامي');
    await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(1);
    await expectNoAccessibilityViolations(page);

    await page.goto(`${WEB}/en/venues/${slug}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('E2E Padel Club');
    await expect(page.getByRole('link', { name: 'Share on WhatsApp' })).toHaveAttribute(
      'href',
      /^https:\/\/wa\.me\/\?text=/,
    );

    // Directory filters by sport.
    await page.goto(`${WEB}/en/venues?sport=padel`);
    await expect(page.locator(`a[href="/en/venues/${slug}"]`)).toBeVisible();
    await page.goto(`${WEB}/en/venues?sport=tennis`);
    await expect(page.locator(`a[href="/en/venues/${slug}"]`)).toHaveCount(0);
  });

  test('the home page lists only sports with venues, most venues first', async ({ page }) => {
    await page.goto(`${WEB}/ar`);
    const tiles = page.getByTestId('sport-tile');
    await expect(tiles.filter({ hasText: 'بادل' })).toBeVisible();
    await expect(page.getByTestId('sport-tile-empty')).toHaveCount(0);
    // Each tile states how many venues offer it, in descending order.
    const counts = (await tiles.allTextContents()).map((t) => Number(/(\d+)/.exec(t)?.[1] ?? 1));
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
    await tiles.filter({ hasText: 'بادل' }).click();
    await expect(page).toHaveURL(`${WEB}/ar/venues?sport=padel`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('ملاعب بادل');
  });

  test('the "all sports" page lists every sport and invites venues for the empty ones', async ({
    page,
  }) => {
    await page.goto(`${WEB}/ar/sports`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('كل الرياضات');
    const empty = page.getByTestId('sport-tile-empty').first();
    await expect(empty).toContainText('عندك ملعب');
    await expect(empty).toHaveAttribute('href', '/ar/manage/register');
    await page.getByTestId('sport-tile').filter({ hasText: 'بادل' }).click();
    await expect(page).toHaveURL(`${WEB}/ar/venues?sport=padel`);
  });

  test('search: free tonight, sorting and the map view', async ({ page }) => {
    const venue = await arrangeVenue(await adminApi(createAdmin()));
    await makeBookable(await userApi(venue.ownerPhone, 'Owner'), venue.venueId, venue.resourceId);
    await page.goto(`${WEB}/en/venues?sport=padel`);
    await page.getByTestId('chip-tonight').click();
    await expect(page).toHaveURL(/date=\d{4}-\d{2}-\d{2}&time=2[0-3](%3A|:)00/);
    await expect(page.getByTestId('chip-tonight')).toHaveAttribute('aria-current', 'page');
    // The page updates in place: one search form, not the old one plus the new one.
    await expect(page.locator('form[role="search"]')).toHaveCount(1);
    // The test venue is open until midnight, so it has free times tonight until about 21:00.
    const ammanHour = Number(
      new Intl.DateTimeFormat('en-GB', {
        hour: '2-digit',
        hourCycle: 'h23',
        timeZone: 'Asia/Amman',
      }).format(new Date()),
    );
    if (ammanHour < 21) {
      const card = page.getByTestId('venue-card').filter({ hasText: 'E2E Venue' }).first();
      await expect(card.getByTestId('free-tonight')).toBeVisible();
    }

    await page.locator('select[name="sort"]').selectOption('price');
    await page.getByTestId('view-map').click();
    await expect(page.getByTestId('results-map')).toBeVisible();
    await expectNoAccessibilityViolations(page);

    // Venue page: the cancellation rule up front and a share image for photo-less venues.
    await page.goto(`${WEB}/en/venues/${venue.slug}`);
    await expect(page.getByTestId('cancellation-badge')).toContainText('Free cancellation');
    const og = await page.request.get(`${WEB}/og/venue/${venue.slug}.png`);
    expect(og.status()).toBe(200);
    expect(og.headers()['content-type']).toBe('image/png');
  });

  test('publishes a sitemap and robots.txt', async ({ request }) => {
    const sitemap = await request.get(`${WEB}/sitemap.xml`);
    expect(sitemap.status()).toBe(200);
    expect(await sitemap.text()).toContain('/ar/venues');
    const robots = await request.get(`${WEB}/robots.txt`);
    expect(await robots.text()).toContain('Disallow: /api/');
  });
});
