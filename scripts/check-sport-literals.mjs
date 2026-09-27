#!/usr/bin/env node
/**
 * Sport-agnostic core check (docs/architecture.md §E).
 *
 * The API must never branch on specific sports: sports exist only as data (seed migrations) and
 * translations. This rejects sport names in API TypeScript source. Tests and SQL seed data are
 * allowed to mention them.
 */
import { join } from 'node:path';
import { listFiles, report, ROOT, scan } from './lib.mjs';

const SPORTS =
  /\b(?:football|soccer|futsal|padel|tennis|basketball|volleyball|squash|badminton|swimming)\b/i;

const files = listFiles(join(ROOT, 'apps/api/src'), ['.ts']);

const violations = scan(files, (line) => {
  const match = SPORTS.exec(line);
  return match ? `sport name "${match[0]}" in core source` : null;
});

report(
  'check-sport-literals',
  violations,
  'Model sport differences as configuration (sports, sport formats, resource types), not code.',
);
