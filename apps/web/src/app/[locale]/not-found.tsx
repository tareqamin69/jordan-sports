import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

export default function NotFound() {
  const t = useTranslations('common.notFound');
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-16">
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <p className="mt-3 text-ink-muted">{t('description')}</p>
      <Link href="/" className="mt-6 inline-block font-medium text-brand-800 underline">
        {t('backHome')}
      </Link>
    </main>
  );
}
