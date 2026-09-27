import { expect, test } from '@playwright/test';
import { createAdmin, randomPhone, signInAdmin } from './helpers';
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
    await page.getByRole('button', { name: 'Add resource' }).click();
    await page.locator('select[name="resourceType"]').selectOption({ label: 'Padel court' });
    await page.locator('input[name="resourceNameAr"]').fill('ملعب 1');
    await page.locator('input[name="resourceNameEn"]').fill('Court 1');
    await page.getByLabel('Padel — Doubles').check();
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

  test('the home page lists sports from the catalog', async ({ page }) => {
    await page.goto(`${WEB}/ar`);
    for (const name of ['كرة القدم', 'بادل', 'تنس']) {
      await expect(page.getByRole('link', { name, exact: true })).toBeVisible();
    }
    await page.getByRole('link', { name: 'بادل', exact: true }).click();
    await expect(page).toHaveURL(`${WEB}/ar/venues?sport=padel`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('ملاعب بادل');
  });

  test('the "all sports" page lists every offered sport and links to its venues', async ({
    page,
  }) => {
    await page.goto(`${WEB}/ar/sports`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('كل الرياضات');
    await expect(page.getByRole('link', { name: 'بادل', exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'بادل', exact: true }).click();
    await expect(page).toHaveURL(`${WEB}/ar/venues?sport=padel`);
  });

  test('publishes a sitemap and robots.txt', async ({ request }) => {
    const sitemap = await request.get(`${WEB}/sitemap.xml`);
    expect(sitemap.status()).toBe(200);
    expect(await sitemap.text()).toContain('/ar/venues');
    const robots = await request.get(`${WEB}/robots.txt`);
    expect(await robots.text()).toContain('Disallow: /api/');
  });
});
