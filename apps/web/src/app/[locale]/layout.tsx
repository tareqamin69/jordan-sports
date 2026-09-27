import { getDirection } from '@jordan-sports/i18n';
import type { Metadata } from 'next';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { Providers } from '@/components/providers';
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
  };
}

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  return (
    <html lang={locale} dir={getDirection(locale)}>
      <body className="flex min-h-dvh flex-col antialiased">
        <NextIntlClientProvider>
          <Providers>
            <SiteHeader />
            {children}
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
