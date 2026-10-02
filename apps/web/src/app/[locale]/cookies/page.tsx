import type { Locale } from '@jordan-sports/i18n';
import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { LegalDocument, legalMetadata } from '@/components/legal-document';

type Props = { params: Promise<{ locale: Locale }> };

// Absolute URLs (metadataBase, share links) use WEB_BASE_URL, which is only known at runtime: the
// deployment image is built without it, so these must not be pre-rendered at build time.
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return legalMetadata('cookies', locale);
}

export default async function CookiesPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <LegalDocument id="cookies" locale={locale} />;
}
