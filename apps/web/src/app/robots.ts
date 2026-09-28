import type { MetadataRoute } from 'next';

// The sitemap URL uses WEB_BASE_URL, known only at runtime (the image is built without it).
export const dynamic = 'force-dynamic';

export default function robots(): MetadataRoute.Robots {
  const site = (process.env.WEB_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
  return {
    rules: {
      userAgent: '*',
      allow: ['/', '/api/v1/media/'],
      disallow: ['/api/', '/ar/account', '/en/account', '/ar/sign-in', '/en/sign-in'],
    },
    sitemap: `${site}/sitemap.xml`,
  };
}
