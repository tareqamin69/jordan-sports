import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));

const SKIP_DIRS = new Set(['node_modules', 'dist', '.next', '.turbo', 'coverage', 'test-results']);

/** Recursively lists files under `dir` whose extension is in `extensions`. */
export function listFiles(dir, extensions) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...listFiles(path, extensions));
    else if (extensions.some((ext) => entry.endsWith(ext))) out.push(path);
  }
  return out;
}

/** Scans files line by line; `check(line)` returns a message for a violation or null. */
export function scan(files, check) {
  const violations = [];
  for (const file of files) {
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, index) => {
      const message = check(line);
      if (message)
        violations.push(`${relative(ROOT, file)}:${index + 1}: ${message}\n    ${line.trim()}`);
    });
  }
  return violations;
}

export function report(name, violations, hint) {
  if (violations.length === 0) {
    console.log(`${name}: ok`);
    return;
  }
  console.error(`${name}: ${violations.length} violation(s)\n`);
  for (const v of violations) console.error(`  ${v}`);
  console.error(`\n${hint}`);
  process.exitCode = 1;
}
