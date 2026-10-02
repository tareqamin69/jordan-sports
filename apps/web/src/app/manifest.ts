import { BRAND_NAME } from '@jordan-sports/brand';
import type { MetadataRoute } from 'next';

/** Web App Manifest — installable, full-screen, Arabic-first (the site's default locale). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/ar',
    name: BRAND_NAME.ar,
    short_name: BRAND_NAME.ar,
    description: 'احجز ملاعب رياضية بكل الأردن بسهولة.',
    lang: 'ar',
    dir: 'rtl',
    start_url: '/ar',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#F6F1E7',
    theme_color: '#0F4D34',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
