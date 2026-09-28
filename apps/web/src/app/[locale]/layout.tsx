import { BRAND_NAME } from '@jordan-sports/brand';
import { getDirection } from '@jordan-sports/i18n';
import type { Metadata, Viewport } from 'next';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { InstallPrompt } from '@/components/install-prompt';
import { Providers } from '@/components/providers';
import { PwaRegister } from '@/components/pwa-register';
import { SiteHeader } from '@/components/site-header';
import { routing } from '@/i18n/routing';
import '../globals.css';

type Props = {
  children: ReactNode;
  params: Promise<{ locale: string }>;
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

/** Matches the design tokens' primary green; installable/full-screen behaviour comes from manifest.ts. */
export const viewport: Viewport = {
  themeColor: '#0f4d34',
  colorScheme: 'light',
  width: 'device-width',
  initialScale: 1,
};

export async function generateMetadata({ params }: Omit<Props, 'children'>): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'web.metadata' });
  return {
    title: t('title'),
    description: t('description'),
    metadataBase: new URL(process.env.WEB_BASE_URL ?? 'http://localhost:3000'),
    alternates: {
      canonical: `/${locale}`,
      languages: Object.fromEntries(routing.locales.map((l) => [l, `/${l}`])),
    },
    manifest: '/manifest.webmanifest',
    icons: { apple: '/apple-touch-icon.png' },
    appleWebApp: { capable: true, statusBarStyle: 'default', title: BRAND_NAME[locale] },
  };
}

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  return (
    <html lang={locale} dir={getDirection(locale)}>
      <body className="flex min-h-dvh flex-col pb-28 antialiased md:pb-0">
        <NextIntlClientProvider>
          <Providers>
            <PwaRegister />
            <SiteHeader />
            {children}
            <InstallPrompt />
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
