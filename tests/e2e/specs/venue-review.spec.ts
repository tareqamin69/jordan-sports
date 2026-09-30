import { expect, test } from '@playwright/test';
import { createAdmin, randomPhone, signInAdmin, signUpPlayer } from './helpers';
import { ADMIN, API, WEB } from './support';

/**
 * Self-registration → admin review (plan §3): an owner registers through the wizard and submits,
 * an admin rejects with a reason, the owner sees it, fixes and resubmits, the admin approves, and
 * the venue appears in search.
 */
test('owner registers, admin rejects with a reason, owner resubmits, admin approves, venue is public', async ({
  page,
  browser,
}) => {
  const suffix = `${Date.now()}`;
  const nameEn = `Review Club ${suffix}`;

  // Owner: wizard, all steps.
  await signUpPlayer(page, 'en', 'Rami', randomPhone(), 'venue');
  await page.goto(`${WEB}/en/manage/register`);
  await page.locator('input[name="nameAr"]').fill(`نادي المراجعة ${suffix}`);
  await page.locator('input[name="nameEn"]').fill(nameEn);
  await page.locator('input[name="contactPhone"]').fill('0791234567');
  await page.getByRole('button', { name: 'Next' }).click();

  await page.getByLabel('Address', { exact: true }).fill('شارع المدينة المنورة');
  await page.getByRole('button', { name: 'Next' }).click();

  await expect(page.locator('input[name="photo"]')).toBeAttached();
  await page.getByRole('button', { name: 'Next' }).click();

  await page.locator('input[name="courtNameEn"]').fill('Court A');
  await page.locator('form input[type="checkbox"]').first().check();
  await page.getByRole('button', { name: 'Add a court' }).click();
  await expect(page.getByText('Court A')).toBeVisible();
  await page.getByRole('button', { name: 'Next' }).click();

  // Contact + optional payout account (IBAN): a local 079… number is accepted.
  await expect(page.locator('input[name="whatsapp"]')).toBeVisible();
  await expect(page.locator('input[name="iban"]')).toBeVisible();
  await page.locator('input[name="whatsapp"]').fill('0791234567');
  await page.getByRole('button', { name: 'Next' }).click();

  await expect(page.getByText('Review your details')).toBeVisible();
  await expect(page.getByRole('link', { name: 'venue owner terms' })).toHaveAttribute(
    'href',
    '/venue-terms',
  );
  await page.getByRole('button', { name: 'Submit for review' }).click();
  await expect(page.getByText('Your registration was submitted!')).toBeVisible();

  // Not public while under review.
  const hidden = await page.request.get(`${API}/v1/venues?limit=50`);
  expect(JSON.stringify(await hidden.json())).not.toContain(nameEn);

  // Admin: review queue → reject with a reason.
  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await signInAdmin(adminPage, createAdmin());
  await adminPage.goto(`${ADMIN}/en/venues`);
  await adminPage.getByRole('link', { name: new RegExp(nameEn) }).click();
  await expect(adminPage.getByTestId('venue-status')).toHaveText('Submitted');
  const reject = adminPage.getByRole('button', { name: 'Reject' });
  await expect(reject).toBeDisabled(); // a reason is required
  await adminPage
    .getByLabel('Reason (recorded in the audit log)')
    .fill('Please add a photo of the court');
  await reject.click();
  await expect(adminPage.getByTestId('venue-status')).toHaveText('Rejected');

  // Owner: sees the result and the reason, fixes and resubmits.
  await page.goto(`${WEB}/en/manage`);
  await expect(page.getByTestId('venue-status-badge')).toHaveText('Rejected');
  await page.getByTestId('managed-venue').click();
  await expect(
    page.getByText('The venue was rejected: Please add a photo of the court'),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Edit and resubmit' }).click();
  await expect(page).toHaveURL(/\/en\/manage\/register\?venueId=/);
  await page.goto(`${page.url()}&step=review`);
  await page.getByRole('button', { name: 'Submit for review' }).click();
  await expect(page.getByText('Your registration was submitted!')).toBeVisible();

  // Admin: approve.
  await adminPage.reload();
  await expect(adminPage.getByTestId('venue-status')).toHaveText('Submitted');
  await adminPage.getByLabel('Reason (recorded in the audit log)').fill('Checked by phone');
  await adminPage.getByRole('button', { name: 'Approve and publish' }).click();
  await expect(adminPage.getByTestId('venue-status')).toHaveText('Approved (public)');
  await adminContext.close();

  // Owner sees it is live; players find it in search and on its page.
  await page.goto(`${WEB}/en/manage`);
  await expect(page.getByTestId('venue-status-badge')).toHaveText('Live');
  await page.goto(`${WEB}/en/venues`);
  await expect(page.getByRole('link', { name: new RegExp(nameEn) }).first()).toBeVisible();
  await page
    .getByRole('link', { name: new RegExp(nameEn) })
    .first()
    .click();
  await expect(page.getByRole('heading', { name: nameEn })).toBeVisible();
});
