import { listVenues } from '@jordan-sports/contracts';
import type { MetadataRoute } from 'next';
import { serverApi, siteUrl } from '@/lib/server-api';

export const dynamic = 'force-dynamic';

/** Public pages in both languages, including every approved venue. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const slugs: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await serverApi(listVenues, {
      query: { limit: 100, ...(cursor ? { cursor } : {}) },
    });
    slugs.push(...page.items.map((v) => v.slug));
    cursor = page.nextCursor ?? undefined;
  } while (cursor);

  const entry = (path: string): MetadataRoute.Sitemap[number] => ({
    url: `${siteUrl}/ar${path}`,
    alternates: { languages: { ar: `${siteUrl}/ar${path}`, en: `${siteUrl}/en${path}` } },
  });
  return [entry(''), entry('/venues'), ...slugs.map((slug) => entry(`/venues/${slug}`))];
}
