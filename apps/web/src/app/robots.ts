import type { MetadataRoute } from 'next';

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
