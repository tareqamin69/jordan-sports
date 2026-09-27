import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

export const WEB = 'http://127.0.0.1:3000';
export const ADMIN = 'http://127.0.0.1:3001';
export const API = 'http://127.0.0.1:4000';

/** Arabic script (letters used in our catalogs). */
export const ARABIC = /[؀-ۿ]/;

export async function expectDocumentLocale(page: Page, lang: 'ar' | 'en') {
  const html = page.locator('html');
  await expect(html).toHaveAttribute('lang', lang);
  await expect(html).toHaveAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
}

/**
 * The brand sits at the inline start of the header and the language switcher at the inline
 * end, so their horizontal order must flip between RTL and LTR.
 */
export async function expectHeaderDirection(page: Page, dir: 'rtl' | 'ltr') {
  const brand = await page.getByTestId('brand').boundingBox();
  const switcher = await page.getByTestId('locale-switcher').boundingBox();
  expect(brand).not.toBeNull();
  expect(switcher).not.toBeNull();
  if (dir === 'rtl') expect(brand!.x).toBeGreaterThan(switcher!.x);
  else expect(brand!.x).toBeLessThan(switcher!.x);
}

export async function expectNoAccessibilityViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(
    results.violations.map(
      (v) =>
        `${v.id}: ${v.help} [${v.nodes
          .map((n) => n.target.join(' '))
          .slice(0, 3)
          .join(' | ')}]`,
    ),
  ).toEqual([]);
}
