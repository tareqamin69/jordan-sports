import { useTranslations } from 'next-intl';
import { buttonClass } from '@jordan-sports/ui';
import { Link } from '@/i18n/navigation';

export default function NotFound() {
  const t = useTranslations('common.notFound');
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-16 sm:px-8">
      <h1 className="font-display text-[2.25rem] leading-[1.2]">{t('title')}</h1>
      <p className="mt-3 text-ink-muted">{t('description')}</p>
      <Link href="/" className={buttonClass({ className: 'mt-8' })}>
        {t('backHome')}
      </Link>
    </main>
  );
}
