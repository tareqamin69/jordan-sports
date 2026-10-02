import { getCatalog, listVenues } from '@jordan-sports/contracts';
import type { Locale } from '@jordan-sports/i18n';
import { SectionHeading, buttonClass } from '@jordan-sports/ui';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { CSSProperties } from 'react';
import { GovernorateChips } from '@/components/governorate-chips';
import { Icon } from '@/components/icons';
import { PitchLines } from '@/components/pitch-lines';
import { SearchBar } from '@/components/search-bar';
import { SportTile } from '@/components/sport-tile';
import { VenuePicks } from '@/components/venue-picks';
import { Link } from '@/i18n/navigation';
import { serverApi } from '@/lib/server-api';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ locale: Locale }> };

export default async function HomePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('web.home');
  const tc = await getTranslations('common');
  const [catalog, venues] = await Promise.all([
    serverApi(getCatalog),
    serverApi(listVenues, { query: { limit: 6 } }),
  ]);
  // Six tiles (two rows on a phone, one on desktop): sports with venues first, in catalog order;
  // the rest are one tap away on /sports.
  const offered = new Set(catalog.offeredSportIds);
  const tiles = [
    ...catalog.sports.filter((s) => offered.has(s.id)),
    ...catalog.sports.filter((s) => !offered.has(s.id)),
  ].slice(0, 6);
  const count = (key: 'venuesCount' | 'sportsCount', n: number) =>
    t.rich(key, {
      count: n,
      n: () => <span className="count-up" style={{ '--to': n } as CSSProperties} />,
    });

  return (
    <main className="flex-1">
      <section className="relative overflow-hidden rounded-b-hero bg-brand-900 text-canvas">
        <PitchLines className="absolute inset-0 size-full opacity-60 sm:opacity-100 rtl:-scale-x-100" />
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(120%_90%_at_15%_100%,rgb(7_42_28/0.95),transparent_60%)] rtl:bg-[radial-gradient(120%_90%_at_85%_100%,rgb(7_42_28/0.95),transparent_60%)]"
        />
        <div className="relative mx-auto flex max-w-6xl animate-rise flex-col gap-4 px-6 pb-28 pt-28 sm:px-8 sm:pb-36 sm:pt-36">
          <span className="text-sm font-medium text-lime">{t('eyebrow')}</span>
          <h1 className="max-w-[14ch] font-display text-[2.6rem] font-extrabold leading-[1.3] text-balance sm:text-[4.25rem] sm:leading-[1.25]">
            {t.rich('title', {
              br: () => <br />,
              hl: (chunks) => <span className="text-lime">{chunks}</span>,
            })}
          </h1>
          <p className="max-w-md text-base leading-7 text-canvas/80 sm:text-lg">
            {t('description')}
          </p>
          {catalog.counts.venues > 0 ? (
            <p
              className="mt-1 flex items-center gap-3 text-sm font-semibold text-canvas/90"
              data-testid="hero-counts"
            >
              <span className="rounded-full bg-canvas/10 px-3 py-1.5">
                {count('venuesCount', catalog.counts.venues)}
              </span>
              <span className="rounded-full bg-canvas/10 px-3 py-1.5">
                {count('sportsCount', catalog.counts.sports)}
              </span>
            </p>
          ) : null}
        </div>
      </section>

      <div className="mx-auto w-full max-w-6xl px-[18px] sm:px-8">
        <SearchBar catalog={catalog} floating className="relative -mt-16 sm:-mt-[4.5rem]" />
      </div>

      <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
        <section aria-labelledby="sports-heading" className="reveal mt-10">
          <SectionHeading
            id="sports-heading"
            title={t('sportsTitle')}
            className="px-1"
            action={
              <Link
                href="/sports"
                className="flex min-h-11 items-center gap-1 text-primary hover:text-primary-hover"
              >
                {tc('allSports')}
                <Icon name="arrow" className="size-4 rtl:rotate-180" />
              </Link>
            }
          />
          <ul className="reveal-stagger no-scrollbar -mx-5 mt-5 flex snap-x gap-2.5 overflow-x-auto px-5 pb-1 sm:mx-0 sm:grid sm:grid-cols-6 sm:gap-3 sm:overflow-visible sm:px-0">
            {tiles.map((sport) => (
              <li key={sport.id} className="w-[30%] shrink-0 snap-start sm:w-auto">
                <SportTile sport={sport} locale={locale} />
              </li>
            ))}
          </ul>
        </section>

        <VenuePicks venues={venues.items} />

        <div className="mt-6 flex">
          <Link
            href="/venues"
            className={buttonClass({ variant: 'secondary', className: 'w-full sm:w-auto' })}
          >
            {t('browseAll')}
          </Link>
        </div>

        <section aria-labelledby="governorates-heading" className="reveal mt-14">
          <SectionHeading
            id="governorates-heading"
            title={t('governoratesTitle')}
            className="px-1"
          />
          <div className="mt-4">
            <GovernorateChips governorates={catalog.governorates} />
          </div>
        </section>

        <section className="reveal relative mb-10 mt-14 flex flex-col gap-3 overflow-hidden rounded-card bg-sand-100 px-6 py-8 text-ink sm:flex-row sm:items-end sm:justify-between sm:gap-8 sm:p-10">
          <svg
            aria-hidden
            viewBox="0 0 200 200"
            className="pointer-events-none absolute -bottom-24 -end-20 size-56 text-sand-200 sm:-bottom-16 sm:-end-10 sm:size-64 sm:text-sand-300"
          >
            <circle cx="100" cy="100" r="70" fill="none" stroke="currentColor" strokeWidth="2" />
            <line x1="100" y1="0" x2="100" y2="200" stroke="currentColor" strokeWidth="2" />
          </svg>
          <div className="relative flex flex-col gap-3">
            <h2 className="font-display text-[1.75rem] leading-[1.3] text-primary sm:text-[2.25rem]">
              {t('ownerTitle')}
              <br />
              {t('ownerTitle2')}
            </h2>
            <p className="max-w-md text-sm leading-7 text-ink/80 sm:text-base">{t('ownerBody')}</p>
          </div>
          <Link
            href="/manage"
            className={buttonClass({
              className: 'group relative mt-1 gap-2 self-start sm:self-auto',
            })}
          >
            {t('ownerCta')}
            <Icon
              name="arrow"
              className="size-4 transition-transform duration-base ease-soft group-hover:translate-x-1 rtl:rotate-180 rtl:group-hover:-translate-x-1"
            />
          </Link>
        </section>
      </div>
    </main>
  );
}
