import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

// Server-side address of the API. Browsers call the same-origin `/api/*`, which is proxied here,
// so session cookies stay first-party (docs/architecture.md §L).
const apiInternalUrl = process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:4000';

// Content Security Policy (production builds; `next dev` needs eval for fast refresh). Next's inline
// bootstrap scripts need 'unsafe-inline' without nonces; everything else is same-origin except the
// map, which loads only when someone opens it (OpenFreeMap vector tiles, OSM raster fallback).
const mapHosts = 'https://tiles.openfreemap.org https://tile.openstreetmap.org';
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${mapHosts}`,
  "font-src 'self'",
  `connect-src 'self' ${mapHosts}`,
  "worker-src 'self' blob:",
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiInternalUrl}/:path*` }];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), payment=(), usb=(), geolocation=(self)',
          },
          ...(process.env.NODE_ENV === 'production'
            ? [{ key: 'Content-Security-Policy', value: csp }]
            : []),
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
