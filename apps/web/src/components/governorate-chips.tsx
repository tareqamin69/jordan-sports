'use client';

import type { Catalog } from '@jordan-sports/contracts';
import { chipClass } from '@jordan-sports/ui';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Link } from '@/i18n/navigation';
import { pick } from '@/lib/localized';

const VISIBLE = 7;

/** Governorate chips linking to the venue search; the "+N" chip reveals the rest in place. */
export function GovernorateChips({ governorates }: { governorates: Catalog['governorates'] }) {
  const t = useTranslations('web.home');
  const locale = useLocale();
  const [all, setAll] = useState(false);
  const shown = all ? governorates : governorates.slice(0, VISIBLE);
  const hidden = governorates.length - shown.length;
  return (
    <ul className="flex flex-wrap gap-2">
      {shown.map((g) => (
        <li key={g.id}>
          <Link
            href={{ pathname: '/venues', query: { governorate: g.key } }}
            className={chipClass(false, {
              className: 'hover:border-night hover:bg-night hover:text-canvas',
            })}
          >
            {pick(g.name, locale)}
          </Link>
        </li>
      ))}
      {hidden > 0 ? (
        <li>
          <button type="button" onClick={() => setAll(true)} className={chipClass(false)}>
            <bdi dir="ltr">{t('moreGovernorates', { count: hidden })}</bdi>
          </button>
        </li>
      ) : null}
    </ul>
  );
}
