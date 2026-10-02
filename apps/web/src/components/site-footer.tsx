'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import { useCatalog } from '@/lib/catalog';
import { LocaleSwitcher } from './locale-switcher';

const venueMode = /^\/manage(\/|$)/;

const links = [
  { href: '/about', key: 'about' },
  { href: '/how-it-works', key: 'howItWorks' },
  { href: '/contact', key: 'contact' },
  { href: '/terms', key: 'terms' },
  { href: '/venue-terms', key: 'venueTerms' },
  { href: '/privacy', key: 'privacy' },
  { href: '/refunds', key: 'refunds' },
  { href: '/cookies', key: 'cookies' },
] as const;

/** Shown on every player-facing page (not the venue owner console, which has its own shell). */
export function SiteFooter() {
  const t = useTranslations('web.footer');
  const locale = useLocale() as 'ar' | 'en';
  const pathname = usePathname();
  // Company details from the owner's settings; shown only once filled in.
  const company = useCatalog().data?.company;
  if (venueMode.test(pathname)) return null;
  const companyName = company?.name?.[locale] ?? company?.name?.ar ?? company?.name?.en;

  return (
    <footer className="mt-auto border-t border-line bg-canvas">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-5 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <nav aria-label={t('about')} className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          {links.map((l) => (
            <Link key={l.key} href={l.href} className="text-ink-muted hover:text-ink">
              {t(l.key)}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-4">
          <p className="text-xs text-ink-muted" data-testid="footer-company">
            {companyName ? `${companyName} · ` : null}
            {company?.registrationNo ? (
              <>
                {t('registration', { number: company.registrationNo })}
                {' · '}
              </>
            ) : null}
            {t('rights', { year: String(new Date().getFullYear()) })}
          </p>
          <LocaleSwitcher landmark={false} testId="footer-locale-switcher" />
        </div>
      </div>
    </footer>
  );
}
