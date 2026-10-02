/* global document */
// Regenerates the web app icons (apps/web/public) from the brand mark: the Arabic letter of
// Jorena (ج) in Alexandria, ivory on club green. Run from the repo root:
//   node tests/e2e/tools/generate-icons.mjs
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const font = readFileSync('apps/web/public/fonts/alexandria-arabic-800.woff2').toString('base64');
const out = 'apps/web/public';

// `size`: output px; `inset`: share of the canvas the tile covers (maskable icons are full bleed
// with the mark inside the 80% safe zone); `radius`: tile corner radius as a share of its size.
const targets = [
  { file: 'icons/icon-512.png', size: 512, radius: 0.22, inset: 1 },
  { file: 'icons/icon-192.png', size: 192, radius: 0.22, inset: 1 },
  { file: 'icons/icon-maskable-512.png', size: 512, radius: 0, inset: 1, mark: 0.8 },
  { file: 'apple-touch-icon.png', size: 180, radius: 0, inset: 1 },
];

const browser = await chromium.launch();
for (const t of targets) {
  const page = await browser.newPage({ viewport: { width: t.size, height: t.size } });
  const m = (t.mark ?? 1) * t.size;
  await page.setContent(`<!doctype html><html><head><style>
    @font-face { font-family: A; src: url(data:font/woff2;base64,${font}) format('woff2'); font-weight: 800; }
    html, body { margin: 0; background: transparent; }
    .tile { width: ${t.size}px; height: ${t.size}px; border-radius: ${t.radius * t.size}px; background: #0f4d34;
      display: grid; place-items: center; overflow: hidden; }
    .mark { position: relative; width: ${m}px; height: ${m}px; }
    .glyph { position: absolute; inset: 0; display: grid; place-items: center; font: 800 ${m * 0.62}px/1 A;
      color: #f6f1e7; transform: translateY(-${m * 0.06}px); }
  </style></head><body><div class="tile"><div class="mark"><div class="glyph">ج</div></div></div></body></html>`);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(out, t.file), omitBackground: t.radius > 0 });
  await page.close();
}
await browser.close();
console.log('icons written to', out);
