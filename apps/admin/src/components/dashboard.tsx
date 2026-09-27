'use client';

import { Card, PageHeader } from '@jordan-sports/ui';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useAdminMe } from '@/lib/admin-session';

export function Dashboard() {
  const t = useTranslations('admin');
  const me = useAdminMe();
  return (
    <>
      <PageHeader
        title={t('home.title')}
        description={t('home.welcome', { name: me.data?.displayName ?? me.data?.email ?? '' })}
      />
      <div className="grid gap-4 sm:grid-cols-3">
        {(['organizations', 'users', 'audit'] as const).map((key) => (
          <Link key={key} href={`/${key}`}>
            <Card className="h-full font-medium text-brand-800 hover:border-brand-300">
              {t(`nav.${key}`)}
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
