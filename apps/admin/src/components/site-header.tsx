import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { LocaleSwitcher } from './locale-switcher';

export function SiteHeader() {
  const t = useTranslations();
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-canvas/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-5 sm:px-8">
        <Link
          href="/"
          className="font-display text-[1.625rem] leading-none text-primary"
          data-testid="brand"
        >
          {t('admin.metadata.title')}
        </Link>
        <div className="ms-auto">
          <LocaleSwitcher />
        </div>
      </div>
    </header>
  );
}
