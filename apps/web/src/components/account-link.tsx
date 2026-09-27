'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useMe } from '@/lib/session';

export function AccountLink() {
  const t = useTranslations('web.header');
  const me = useMe();
  if (me.isPending) return <span className="w-20" aria-hidden />;
  return (
    <>
      {me.data ? (
        <Link
          href="/bookings"
          className="rounded-md px-3 py-1.5 text-sm font-medium text-brand-800 hover:bg-brand-50"
          data-testid="bookings-link"
        >
          {t('bookings')}
        </Link>
      ) : null}
      <Link
        href={me.data ? '/account' : '/sign-in'}
        className="rounded-md px-3 py-1.5 text-sm font-medium text-brand-800 hover:bg-brand-50"
        data-testid="account-link"
      >
        {me.data ? (me.data.displayName ?? t('account')) : t('signIn')}
      </Link>
    </>
  );
}
