import { getCatalog, listVenues } from '@jordan-sports/contracts';
import type { Locale } from '@jordan-sports/i18n';
import { SectionHeading, buttonClass, cx } from '@jordan-sports/ui';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { CSSProperties } from 'react';
import { HeroArt } from '@/components/court-art';
import { GovernorateChips } from '@/components/governorate-chips';
import { Icon } from '@/components/icons';
import { Photo } from '@/components/photo';
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
  // Every active sport is shown, even before it has venues (the admin can hide one later).
  const tiles = catalog.sports;
  // A self-hosted stock photo of the first sport that has one; the illustrated pitch otherwise.
  const heroPhoto = catalog.sports.find((s) => s.photos.length > 0)?.photos[0];
  const count = (key: 'venuesCount' | 'sportsCount', n: number) =>
    t.rich(key, {
      count: n,
      n: () => <span className="count-up" style={{ '--to': n } as CSSProperties} />,
    });

  return (
    <main className="flex-1">
      <section className="relative h-[470px] overflow-hidden rounded-b-hero bg-night sm:h-[540px]">
        {heroPhoto ? (
          // Taller than the hero so the slow drift never shows an edge.
          <div className="parallax-slow absolute inset-x-0 -top-16 bottom-0">
            <Photo photo={heroPhoto} alt="" sizes="100vw" eager />
          </div>
        ) : (
          <HeroArt className="absolute inset-0" />
        )}
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-night/70 to-transparent"
        />
        <div
          aria-hidden
          className={cx(
            'absolute inset-0 bg-gradient-to-b to-night/90',
            heroPhoto ? 'from-night/10 from-20%' : 'from-night/0 from-40%',
          )}
        />
        <div className="absolute inset-x-0 bottom-[92px] sm:bottom-[120px]">
          <div className="mx-auto flex max-w-6xl animate-rise flex-col gap-2.5 px-6 text-canvas sm:px-8">
            <span className="text-xs font-medium ltr:tracking-[0.12em] opacity-85">
              {t('eyebrow')}
            </span>
            <h1 className="max-w-[12ch] font-display text-[3rem] leading-[1.12] text-balance sm:max-w-none sm:text-[4.5rem]">
              {t('title')}
            </h1>
            <p className="hidden max-w-xl text-lg text-canvas/85 sm:block">{t('description')}</p>
            {catalog.counts.venues > 0 ? (
              <p
                className="flex items-center gap-2 text-sm font-semibold text-canvas/90"
                data-testid="hero-counts"
              >
                <span className="relative flex size-2" aria-hidden>
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-lime opacity-60 motion-reduce:hidden" />
                  <span className="relative inline-flex size-2 rounded-full bg-lime" />
                </span>
                <span>{count('venuesCount', catalog.counts.venues)}</span>
                <span aria-hidden>·</span>
                <span>{count('sportsCount', catalog.counts.sports)}</span>
              </p>
            ) : null}
          </div>
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
          <ul className="reveal-stagger mt-5 grid grid-cols-3 gap-2.5 sm:grid-cols-6 sm:gap-3">
            {tiles.map((sport) => (
              <li key={sport.id}>
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

        <section className="reveal mb-10 mt-14 flex flex-col gap-3 rounded-card bg-primary px-6 py-7 text-on-primary sm:flex-row sm:items-end sm:justify-between sm:gap-8 sm:p-10">
          <div className="flex flex-col gap-3">
            <h2 className="font-display text-[1.875rem] leading-[1.2] sm:text-[2.5rem]">
              {t('ownerTitle')}
              <br />
              {t('ownerTitle2')}
            </h2>
            <p className="max-w-md text-sm leading-7 text-on-primary/85 sm:text-base">
              {t('ownerBody')}
            </p>
          </div>
          <Link
            href="/manage"
            className={buttonClass({
              variant: 'inverse',
              className: 'group mt-1 gap-2 self-start sm:self-auto',
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
