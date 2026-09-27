#!/usr/bin/env node
/**
 * RTL safety check (docs/architecture.md §M, ADR-0011).
 *
 * Arabic is the default locale, so layout must use logical directions. This rejects physical
 * left/right Tailwind utilities and CSS properties in UI source. Use instead:
 *   ml-/mr- → ms-/me-     pl-/pr- → ps-/pe-     left-/right- → start-/end-
 *   text-left/right → text-start/end            rounded-l/r → rounded-s/e
 *   border-l/r → border-s/e                     margin-left → margin-inline-start, etc.
 */
import { join } from 'node:path';
import { listFiles, report, ROOT, scan } from './lib.mjs';

const TAILWIND_PHYSICAL =
  /(?<![\w-])-?(?:m[lr]|p[lr]|scroll-m[lr]|scroll-p[lr]|left|right|text-(?:left|right)|float-(?:left|right)|clear-(?:left|right)|rounded-(?:[lr]|[tb][lr])|border-[lr]|space-x-reverse|divide-x-reverse)(?:-[\w./[\]%]+)?(?![\w-])/;
const CSS_PHYSICAL =
  /(?:^|[\s;{])(?:margin-(?:left|right)|padding-(?:left|right)|border-(?:left|right)(?:-\w+)?|left|right|text-align:\s*(?:left|right)|float:\s*(?:left|right))\s*:/;

const dirs = ['apps/web/src', 'apps/admin/src', 'packages/ui/src'].map((d) => join(ROOT, d));

const tsx = dirs.flatMap((d) => listFiles(d, ['.tsx', '.jsx']));
const css = dirs.flatMap((d) => listFiles(d, ['.css']));

const classNameContext = /(?:className|class)=|clsx\(|cn\(|cva\(|tw`/;

const violations = [
  ...scan(tsx, (line) => {
    if (!classNameContext.test(line)) return null;
    const match = TAILWIND_PHYSICAL.exec(line.slice(line.search(classNameContext)));
    return match ? `physical direction utility "${match[0]}"` : null;
  }),
  ...scan(css, (line) => {
    const match = CSS_PHYSICAL.exec(line);
    return match ? `physical direction CSS property "${match[0].trim()}"` : null;
  }),
];

report(
  'check-rtl',
  violations,
  'Use logical properties (start/end, inline-start/inline-end) instead.',
);
