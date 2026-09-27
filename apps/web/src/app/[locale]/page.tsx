import { getCatalog, listVenues } from '@jordan-sports/contracts';
import type { Locale } from '@jordan-sports/i18n';
import { SectionHeading, buttonClass, tileClass } from '@jordan-sports/ui';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { HeroArt } from '@/components/court-art';
import { GovernorateChips } from '@/components/governorate-chips';
import { Icon } from '@/components/icons';
import { SearchBar } from '@/components/search-bar';
import { VenuePicks } from '@/components/venue-picks';
import { Link } from '@/i18n/navigation';
import { pick } from '@/lib/localized';
import { serverApi } from '@/lib/server-api';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ locale: Locale }> };

/** Sport tiles shown on the home page before the "and more" tile. */
const TILES = 5;

export default async function HomePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('web.home');
  const tc = await getTranslations('common');
  const [catalog, venues] = await Promise.all([
    serverApi(getCatalog),
    serverApi(listVenues, { query: { limit: 6 } }),
  ]);
  // Players only see sports that at least one approved venue actually offers.
  const offeredSports = catalog.sports.filter((s) => catalog.offeredSportIds.includes(s.id));
  const tiles = offeredSports.length > TILES + 1 ? offeredSports.slice(0, TILES) : offeredSports;
  const more = tiles.length < offeredSports.length;

  return (
    <main className="flex-1">
      <section className="relative h-[470px] overflow-hidden rounded-b-hero bg-night sm:h-[540px]">
        <HeroArt className="absolute inset-0" />
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-b from-night/0 from-40% to-night/90"
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
          </div>
        </div>
      </section>

      <div className="mx-auto w-full max-w-6xl px-[18px] sm:px-8">
        <SearchBar catalog={catalog} floating className="relative -mt-16 sm:-mt-[4.5rem]" />
      </div>

      <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
        <section aria-labelledby="sports-heading" className="mt-10">
          <SectionHeading
            id="sports-heading"
            title={t('sportsTitle')}
            className="px-1"
            action={
              <Link
                href="/sports"
                className="flex items-center gap-1 text-primary hover:text-primary-hover"
              >
                {tc('allSports')}
                <Icon name="arrow" className="size-4 rtl:rotate-180" />
              </Link>
            }
          />
          <ul className="mt-5 grid grid-cols-3 gap-2.5 sm:grid-cols-6 sm:gap-3">
            {tiles.map((sport) => (
              <li key={sport.id}>
                <Link
                  href={{ pathname: '/venues', query: { sport: sport.key } }}
                  className={tileClass(
                    false,
                    'group h-26 hover:border-primary hover:bg-primary hover:text-on-primary',
                  )}
                >
                  <Icon name={sport.icon} className="size-7" strokeWidth={1.5} />
                  <span className="truncate text-sm font-semibold">{pick(sport.name, locale)}</span>
                </Link>
              </li>
            ))}
            {more ? (
              <li>
                <Link
                  href="/sports"
                  className={tileClass(
                    false,
                    'h-26 hover:border-primary hover:bg-primary hover:text-on-primary',
                  )}
                >
                  <Icon name="more" className="size-7" strokeWidth={3} />
                  <span className="truncate text-sm font-semibold">{t('moreSports')}</span>
                </Link>
              </li>
            ) : null}
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

        <section aria-labelledby="governorates-heading" className="mt-14">
          <SectionHeading
            id="governorates-heading"
            title={t('governoratesTitle')}
            className="px-1"
          />
          <div className="mt-4">
            <GovernorateChips governorates={catalog.governorates} />
          </div>
        </section>

        <section className="mb-10 mt-14 flex flex-col gap-3 rounded-card bg-primary px-6 py-7 text-on-primary sm:flex-row sm:items-end sm:justify-between sm:gap-8 sm:p-10">
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
              className: 'mt-1 self-start sm:self-auto',
            })}
          >
            {t('ownerCta')}
          </Link>
        </section>
      </div>
    </main>
  );
}
