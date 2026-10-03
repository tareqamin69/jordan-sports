import { getVenue, type PublicVenue } from '@jordan-sports/contracts/web';
import type { Locale } from '@jordan-sports/i18n';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { formatMoney } from '@jordan-sports/money';
import { SectionHeading, buttonClass } from '@jordan-sports/ui';
import { CourtArt } from '@/components/court-art';
import { Icon } from '@/components/icons';
import { VenueAvailability } from '@/components/venue-availability';
import { VenueGallery } from '@/components/venue-gallery';
import { VenueMapCard } from '@/components/venue-map-lazy';
import { VenueStickyHeader } from '@/components/venue-sticky-header';
import { Link } from '@/i18n/navigation';
import { directionsUrl } from '@/lib/format';
import { joinList, joinPlace, pick } from '@/lib/localized';
import { isNotFound, serverApi, siteUrl } from '@/lib/server-api';

export const dynamic = 'force-dynamic';

/** Icon per catalog amenity key; amenities added later by the admin get a check mark. */
const amenityIcon: Record<string, string> = {
  parking: 'parking',
  changing_rooms: 'hanger',
  showers: 'shower',
  prayer_room: 'dome',
  cafe: 'cup',
  equipment_rental: 'tag',
  spectator_seating: 'seats',
  accessible: 'accessible',
};

type Props = {
  params: Promise<{ locale: Locale; slug: string }>;
  searchParams: Promise<{ date?: string; time?: string }>;
};

const loadVenue = cache(async (slug: string): Promise<PublicVenue | null> => {
  if (!/^[a-z0-9-]{1,60}$/.test(slug)) return null;
  try {
    return await serverApi(getVenue, { params: { slug } });
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const venue = await loadVenue(slug);
  if (!venue) return {};
  const title = pick(venue.name, locale);
  const description = pick(venue.description, locale) || undefined;
  return {
    title,
    ...(description ? { description } : {}),
    alternates: {
      canonical: `/${locale}/venues/${slug}`,
      languages: { ar: `/ar/venues/${slug}`, en: `/en/venues/${slug}` },
    },
    openGraph: {
      title,
      ...(description ? { description } : {}),
      locale: locale === 'ar' ? 'ar_JO' : 'en_JO',
      ...(venue.cover
        ? {
            images: [
              {
                url: `${siteUrl}/api${venue.cover.url}`,
                width: venue.cover.width,
                height: venue.cover.height,
              },
            ],
          }
        : // No photos yet: a generated share card (/og/venue/<slug>.png).
          { images: [{ url: `${siteUrl}/og/venue/${slug}.png`, width: 1200, height: 630 }] }),
    },
  };
}

/** JSON-LD for search engines; `<` is escaped so venue text cannot break out of the script tag. */
function jsonLd(venue: PublicVenue, locale: string, url: string): string {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'SportsActivityLocation',
    name: pick(venue.name, locale),
    url,
    ...(pick(venue.description, locale) ? { description: pick(venue.description, locale) } : {}),
    ...(venue.contactPhone ? { telephone: venue.contactPhone } : {}),
    address: {
      '@type': 'PostalAddress',
      addressLocality: pick(venue.governorate.name, locale),
      addressCountry: 'JO',
      ...(pick(venue.address, locale) ? { streetAddress: pick(venue.address, locale) } : {}),
    },
    ...(venue.location
      ? {
          geo: {
            '@type': 'GeoCoordinates',
            latitude: venue.location.lat,
            longitude: venue.location.lng,
          },
        }
      : {}),
    ...(venue.media.length ? { image: venue.media.map((m) => `${siteUrl}/api${m.url}`) } : {}),
  };
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

export default async function VenuePage({ params, searchParams }: Props) {
  const { locale, slug } = await params;
  const query = await searchParams;
  const date = query.date && /^\d{4}-\d{2}-\d{2}$/.test(query.date) ? query.date : undefined;
  const time = query.time && /^\d{2}:\d{2}$/.test(query.time) ? query.time : undefined;
  setRequestLocale(locale);
  const venue = await loadVenue(slug);
  if (!venue) notFound();
  const t = await getTranslations('web.venue');
  const tc = await getTranslations('common');
  const name = pick(venue.name, locale);
  const url = `${siteUrl}/${locale}/venues/${slug}`;
  const place = [
    pick(venue.address, locale),
    venue.area ? pick(venue.area.name, locale) : '',
    pick(venue.governorate.name, locale),
  ].filter(Boolean);
  const whatsapp = `https://wa.me/?text=${encodeURIComponent(`${t('shareText', { name, appName: tc('appName') })} ${url}`)}`;

  const address = joinPlace(place, locale);
  const directions = directionsUrl(venue.location, `${name} ${address}`);

  const priceFrom = venue.priceFrom;
  const pill =
    'pressable flex h-11 items-center gap-2 rounded-full border border-line-strong bg-surface px-4 text-sm font-medium text-ink transition-colors hover:border-ink/30';

  return (
    <main className="flex-1">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(venue, locale, url) }}
      />

      <VenueStickyHeader
        name={name}
        price={priceFrom ? `${t('from')} ${formatMoney(priceFrom, locale)}` : null}
        bookLabel={t('book')}
      />

      <VenueGallery media={venue.media} venueId={venue.id} name={name} icon={venue.sports[0]?.icon}>
        <span className="text-xs font-medium ltr:tracking-[0.12em] text-canvas/85">
          {joinList(
            venue.sports.map((s) => pick(s.name, locale)),
            locale,
          )}
        </span>
        <h1 className="pb-1 font-display text-[2.25rem] leading-[1.35] text-balance sm:text-[3.25rem] sm:leading-[1.3]">
          {name}
        </h1>
        <p className="flex items-center gap-1.5 text-sm text-canvas/85">
          <Icon name="pin" className="size-4 shrink-0" />
          {joinPlace(
            [venue.area ? pick(venue.area.name, locale) : '', pick(venue.governorate.name, locale)],
            locale,
          )}
        </p>
      </VenueGallery>

      <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
        <div className="mt-6 grid gap-10 lg:mt-10 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-12">
          <div className="flex min-w-0 flex-col gap-10">
            <div className="flex flex-col gap-5">
              <p
                className="flex items-start gap-3 rounded-tile bg-brand-50 p-4 text-sm leading-6"
                data-testid="cancellation-badge"
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-on-primary">
                  <Icon name="check" className="size-4" />
                </span>
                <span>
                  <strong className="font-semibold text-primary">
                    {t('cancel.free', { hours: venue.cancellation.freeHours })}
                  </strong>{' '}
                  <span className="text-ink-muted">
                    {t('cancel.late', { percent: String(venue.cancellation.lateRefundPercent) })}
                  </span>
                </span>
              </p>
              <dl className="grid grid-cols-3 gap-2 sm:gap-3" data-testid="venue-facts">
                {[
                  {
                    icon: venue.sports[0]?.icon ?? 'grid',
                    label: t('facts.courts'),
                    value: t('facts.courtsValue', { count: venue.resources.length }),
                  },
                  {
                    icon: 'calendar',
                    label: t('facts.window'),
                    value: t('facts.windowValue', { days: venue.bookingWindowDays }),
                  },
                  { icon: 'card', label: t('facts.payment'), value: t('facts.paymentValue') },
                ].map((f) => (
                  <div
                    key={f.label}
                    className="flex flex-col gap-2 rounded-tile bg-sand-100 p-3 sm:p-4"
                  >
                    <Icon name={f.icon} className="size-5 text-primary" />
                    <dt className="text-xs text-sand-700">{f.label}</dt>
                    <dd className="text-sm font-semibold leading-snug">{f.value}</dd>
                  </div>
                ))}
              </dl>
              <div className="flex items-end justify-between gap-4 lg:hidden">
                {priceFrom ? (
                  <p className="flex flex-col">
                    <span className="text-xs text-ink-muted">{t('from')}</span>
                    <span className="text-2xl font-bold leading-tight text-primary">
                      {formatMoney(priceFrom, locale)}
                    </span>
                    <span className="text-xs text-ink-muted">
                      {t('perDuration', { minutes: priceFrom.durationMinutes })}
                    </span>
                  </p>
                ) : (
                  <span />
                )}
                <a href="#book" className={buttonClass({ className: 'px-8' })}>
                  {t('book')}
                </a>
              </div>
              <ul className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 lg:hidden">
                {venue.contactPhone ? (
                  <li className="shrink-0">
                    <a href={`tel:${venue.contactPhone}`} className={pill}>
                      <Icon name="phone" className="size-4" />
                      {t('call')}
                    </a>
                  </li>
                ) : null}
                <li className="shrink-0">
                  <a href={directions} target="_blank" rel="noopener noreferrer" className={pill}>
                    <Icon name="pin" className="size-4" />
                    {t('directions')}
                  </a>
                </li>
                <li className="shrink-0">
                  <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={pill}>
                    <Icon name="share" className="size-4" />
                    {t('share')}
                  </a>
                </li>
              </ul>
            </div>

            <div
              id="book"
              className="scroll-mt-24 rounded-card border border-line bg-surface p-5 sm:p-7"
            >
              <VenueAvailability
                slug={venue.slug}
                timezone={venue.timezone}
                windowDays={venue.bookingWindowDays}
                resources={venue.resources}
                initialDate={date}
                initialTime={time}
              />
            </div>

            {pick(venue.description, locale) ? (
              <section className="reveal">
                <SectionHeading title={t('about')} />
                <p className="mt-3 max-w-prose whitespace-pre-line leading-8 text-ink">
                  {pick(venue.description, locale)}
                </p>
              </section>
            ) : null}

            <section className="reveal">
              <SectionHeading title={t('resources')} />
              <ul className="reveal-stagger mt-4 grid gap-3 sm:grid-cols-2">
                {venue.resources.map((r) => (
                  <li
                    key={r.id}
                    className="flex gap-4 rounded-tile border border-line bg-surface p-4"
                    data-testid="venue-resource"
                  >
                    <span className="relative size-16 shrink-0 overflow-hidden rounded-[0.875rem] bg-night">
                      <CourtArt icon={venue.sports[0]?.icon} variant="top" />
                    </span>
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="font-bold">{pick(r.name, locale)}</span>
                      <span className="text-sm text-ink-muted">
                        {pick(r.type.name, locale)} ·{' '}
                        {joinList(
                          r.formats.map((f) => pick(f.name, locale)),
                          locale,
                        )}
                      </span>
                      {r.features.length > 0 ? (
                        <span className="text-sm text-ink-muted">
                          {joinList(
                            r.features.map((f) =>
                              f.value
                                ? `${pick(f.label, locale)}: ${pick(f.value, locale)}`
                                : pick(f.label, locale),
                            ),
                            locale,
                          )}
                        </span>
                      ) : null}
                      {r.unitCount > 1 ? (
                        <span className="text-sm text-primary">
                          {t('combines', { count: r.unitCount })}
                        </span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <aside className="flex flex-col gap-8 lg:sticky lg:top-24 lg:self-start">
            <div className="hidden flex-col gap-4 rounded-card border border-line bg-surface p-6 lg:flex">
              {priceFrom ? (
                <p className="flex flex-col">
                  <span className="text-xs text-ink-muted">{t('from')}</span>
                  <span className="text-3xl font-bold leading-tight text-primary">
                    {formatMoney(priceFrom, locale)}
                  </span>
                  <span className="text-sm text-ink-muted">
                    {t('perDuration', { minutes: priceFrom.durationMinutes })}
                  </span>
                </p>
              ) : null}
              <a href="#book" className={buttonClass({ size: 'lg', className: 'w-full' })}>
                {t('book')}
              </a>
              <div className="flex flex-col gap-2">
                {venue.contactPhone ? (
                  <a
                    href={`tel:${venue.contactPhone}`}
                    className={buttonClass({ variant: 'secondary', className: 'w-full' })}
                  >
                    <Icon name="phone" className="size-4" />
                    {t('contact')}
                  </a>
                ) : null}
                <a
                  href={whatsapp}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={buttonClass({ variant: 'secondary', className: 'w-full' })}
                >
                  <Icon name="share" className="size-4" />
                  {t('share')}
                </a>
              </div>
            </div>

            {place.length > 0 || venue.location ? (
              <section>
                <h2 className="font-display text-2xl">{t('address')}</h2>
                <p className="mt-2 text-ink">{address}</p>
                {venue.location ? <VenueMapCard location={venue.location} name={name} /> : null}
                <a
                  href={directions}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={buttonClass({ variant: 'secondary', size: 'sm', className: 'mt-3' })}
                >
                  <Icon name="pin" className="size-4" />
                  {t('directions')}
                </a>
              </section>
            ) : null}
            {venue.amenities.length > 0 ? (
              <section>
                <h2 className="font-display text-2xl">{t('amenities')}</h2>
                <ul className="reveal-stagger mt-3 flex flex-wrap gap-2">
                  {venue.amenities.map((a) => (
                    <li
                      key={a.id}
                      className="flex h-10 items-center gap-2 rounded-full bg-surface pe-4 ps-1.5 text-sm text-ink ring-1 ring-line"
                    >
                      <span className="grid size-7 place-items-center rounded-full bg-brand-50 text-primary">
                        <Icon name={amenityIcon[a.key] ?? 'check'} className="size-4" />
                      </span>
                      {pick(a.name, locale)}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            <Link
              href={{ pathname: '/support', query: { venue: venue.id } }}
              className="self-start text-sm text-ink-muted underline-offset-4 hover:text-ink hover:underline"
              data-testid="report-venue"
            >
              {t('reportVenue')}
            </Link>
          </aside>
        </div>
      </div>
    </main>
  );
}
