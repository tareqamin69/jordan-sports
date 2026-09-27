import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { AccountLink } from './account-link';
import { LocaleSwitcher } from './locale-switcher';

export function SiteHeader() {
  const t = useTranslations('common');
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3">
        <Link href="/" className="text-lg font-bold text-brand-700" data-testid="brand">
          {t('appName')}
        </Link>
        <Link href="/sports" className="text-sm font-medium text-ink hover:text-brand-700">
          {t('allSports')}
        </Link>
        <div className="ms-auto flex items-center gap-1">
          <AccountLink />
          <LocaleSwitcher />
        </div>
      </div>
    </header>
  );
}
