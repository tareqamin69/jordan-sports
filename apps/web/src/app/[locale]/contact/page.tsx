import type { Locale } from '@jordan-sports/i18n';
import { Alert, Card, Ltr, PageHeader, buttonClass } from '@jordan-sports/ui';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Icon } from '@/components/icons';

type Props = { params: Promise<{ locale: Locale }> };

/** Placeholder until a real support line is confirmed (see SUPPORT_WHATSAPP in .env.example). */
const DEFAULT_SUPPORT_WHATSAPP = '+962700000000';
const SUPPORT_EMAIL = 'support@jorena.app';

// Absolute URLs (metadataBase, share links) use WEB_BASE_URL, which is only known at runtime: the
// deployment image is built without it, so these must not be pre-rendered at build time.
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'web.contact' });
  return {
    title: t('title'),
    description: t('description'),
    alternates: {
      canonical: `/${locale}/contact`,
      languages: { ar: '/ar/contact', en: '/en/contact' },
    },
  };
}

export default async function ContactPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('web.contact');
  const whatsapp = process.env.SUPPORT_WHATSAPP ?? DEFAULT_SUPPORT_WHATSAPP;
  const waDigits = whatsapp.replace(/[^0-9]/g, '');

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-5 pb-10 pt-8 sm:px-8 sm:pt-12">
      <PageHeader title={t('title')} description={t('description')} />
      <Alert tone="warning" className="mb-6">
        {t('placeholderNotice')}
      </Alert>
      <Card className="flex flex-col gap-5">
        <div className="flex items-center gap-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-brand-50 text-primary">
            <Icon name="share" className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="font-semibold text-ink">{t('whatsapp')}</p>
            <p className="text-sm text-ink-muted">{t('whatsappBody')}</p>
          </div>
        </div>
        <a
          href={`https://wa.me/${waDigits}`}
          target="_blank"
          rel="noreferrer"
          className={buttonClass({ className: 'self-start' })}
        >
          {t('whatsapp')} <Ltr>{whatsapp}</Ltr>
        </a>
        <div className="border-t border-line pt-5">
          <p className="text-sm text-ink-muted">{t('email')}</p>
          <a href={`mailto:${SUPPORT_EMAIL}`} className="font-medium text-primary hover:underline">
            <Ltr>{SUPPORT_EMAIL}</Ltr>
          </a>
        </div>
      </Card>
    </main>
  );
}
