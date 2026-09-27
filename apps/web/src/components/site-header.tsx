import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { LocaleSwitcher } from './locale-switcher';

export function SiteHeader() {
  const t = useTranslations('common');
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3">
        <Link href="/" className="text-lg font-bold text-brand-700" data-testid="brand">
          {t('appName')}
        </Link>
        <div className="ms-auto">
          <LocaleSwitcher />
        </div>
      </div>
    </header>
  );
}
