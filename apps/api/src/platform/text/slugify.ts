import { randomBytes } from 'node:crypto';

/**
 * URL slug from a (possibly Arabic-only) name plus a short random suffix for uniqueness —
 * self-registering owners never see or pick a slug themselves (plan §3).
 */
export function slugify(text: string): string {
  const base = text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  // Random, not a UUIDv7 prefix: those first characters are the clock, so two Arabic-only names
  // registered within the same minute used to get the same slug.
  return `${base || 'venue'}-${randomBytes(4).toString('hex')}`;
}
