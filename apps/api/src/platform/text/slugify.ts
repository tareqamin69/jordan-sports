import { uuidv7 } from '../database/ids.js';

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
  return `${base || 'venue'}-${uuidv7().slice(0, 8)}`;
}
