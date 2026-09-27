import { getVenue, type PublicVenue } from '@jordan-sports/contracts';
import type { Locale } from '@jordan-sports/i18n';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { formatMoney } from '@jordan-sports/money';
import { Icon } from '@/components/icons';
import { VenueAvailability } from '@/components/venue-availability';
import { VenueGallery } from '@/components/venue-gallery';
import { directionsUrl, mapEmbedUrl } from '@/lib/format';
import { joinList, pick } from '@/lib/localized';
import { isNotFound, serverApi, siteUrl } from '@/lib/server-api';

export const dynamic = 'force-dynamic';

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
        : {}),
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
  const name = pick(venue.name, locale);
  const url = `${siteUrl}/${locale}/venues/${slug}`;
  const place = [
    pick(venue.address, locale),
    venue.area ? pick(venue.area.name, locale) : '',
    pick(venue.governorate.name, locale),
  ].filter(Boolean);
  const whatsapp = `https://wa.me/?text=${encodeURIComponent(`${t('shareText', { name })} ${url}`)}`;

  const address = joinList(place, locale);
  const directions = directionsUrl(venue.location, `${name} ${address}`);

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-28 pt-6 sm:pb-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(venue, locale, url) }}
      />

      <VenueGallery media={venue.media} name={name} />

      <div className="mt-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold sm:text-4xl">{name}</h1>
          <p className="mt-1 flex items-center gap-1 text-ink-muted">
            <Icon name="pin" className="size-4 shrink-0" />
            {joinList(
              [
                venue.area ? pick(venue.area.name, locale) : '',
                pick(venue.governorate.name, locale),
              ].filter(Boolean),
              locale,
            )}
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {venue.sports.map((s) => (
              <li
                key={s.id}
                className="flex items-center gap-1 rounded-full bg-brand-50 px-3 py-1 text-sm text-brand-900"
              >
                <Icon name={s.icon} className="size-4" />
                {pick(s.name, locale)}
              </li>
            ))}
          </ul>
        </div>
        {venue.priceFrom ? (
          <p className="rounded-xl bg-brand-50 px-4 py-2 text-center">
            <span className="block text-xs text-ink-muted">{t('from')}</span>
            <span className="text-xl font-bold text-brand-900">
              {formatMoney(venue.priceFrom, locale)}
            </span>
            <span className="block text-xs text-ink-muted">
              {t('perDuration', { minutes: String(venue.priceFrom.durationMinutes) })}
            </span>
          </p>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        {venue.contactPhone ? (
          <a
            href={`tel:${venue.contactPhone}`}
            className="hidden items-center gap-2 rounded-md bg-brand-700 sm:flex px-4 py-2.5 font-medium text-white hover:bg-brand-800"
          >
            <Icon name="phone" />
            {t('contact')}
          </a>
        ) : null}
        <a
          href={directions}
          target="_blank"
          rel="noopener noreferrer"
          className="hidden items-center gap-2 rounded-md border border-line bg-surface px-4 py-2.5 font-medium text-ink hover:bg-canvas sm:flex"
        >
          <Icon name="pin" />
          {t('directions')}
        </a>
        <a
          href={whatsapp}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 rounded-md border border-line bg-surface px-4 py-2.5 font-medium text-ink hover:bg-canvas"
        >
          <Icon name="share" />
          {t('share')}
        </a>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-8 lg:col-span-2">
          <div id="book" className="scroll-mt-4">
            <VenueAvailability
              slug={venue.slug}
              timezone={venue.timezone}
              resources={venue.resources}
              initialDate={date}
              initialTime={time}
            />
          </div>
          {pick(venue.description, locale) ? (
            <section>
              <h2 className="text-xl font-bold">{t('about')}</h2>
              <p className="mt-3 whitespace-pre-line text-ink">{pick(venue.description, locale)}</p>
            </section>
          ) : null}
          <section>
            <h2 className="text-xl font-bold">{t('resources')}</h2>
            <ul className="mt-3 grid gap-3 sm:grid-cols-2">
              {venue.resources.map((r) => (
                <li
                  key={r.id}
                  className="rounded-lg border border-line bg-surface p-4"
                  data-testid="venue-resource"
                >
                  <p className="font-bold">{pick(r.name, locale)}</p>
                  <p className="text-sm text-ink-muted">
                    {pick(r.type.name, locale)} ·{' '}
                    {joinList(
                      r.formats.map((f) => pick(f.name, locale)),
                      locale,
                    )}
                  </p>
                  {r.features.length > 0 ? (
                    <p className="mt-1 text-sm text-ink-muted">
                      {joinList(
                        r.features.map((f) =>
                          f.value
                            ? `${pick(f.label, locale)}: ${pick(f.value, locale)}`
                            : pick(f.label, locale),
                        ),
                        locale,
                      )}
                    </p>
                  ) : null}
                  {r.unitCount > 1 ? (
                    <p className="mt-1 text-sm text-brand-800">
                      {t('combines', { count: String(r.unitCount) })}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        </div>
        <aside className="flex flex-col gap-6">
          {place.length > 0 || venue.location ? (
            <section>
              <h2 className="text-lg font-bold">{t('address')}</h2>
              <p className="mt-2 text-ink">{address}</p>
              {venue.location ? (
                <iframe
                  title={t('mapTitle', { name })}
                  src={mapEmbedUrl(venue.location)}
                  loading="lazy"
                  className="mt-3 aspect-[4/3] w-full rounded-lg border border-line"
                />
              ) : null}
              <a
                href={directions}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1 font-medium text-brand-800 underline"
              >
                <Icon name="pin" className="size-4" />
                {t('directions')}
              </a>
            </section>
          ) : null}
          {venue.amenities.length > 0 ? (
            <section>
              <h2 className="text-lg font-bold">{t('amenities')}</h2>
              <ul className="mt-2 flex flex-wrap gap-2">
                {venue.amenities.map((a) => (
                  <li
                    key={a.id}
                    className="rounded-full bg-brand-50 px-3 py-1 text-sm text-brand-900"
                  >
                    {pick(a.name, locale)}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </aside>
      </div>

      <nav
        aria-label={t('quickActions')}
        className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-3 gap-2 border-t border-line bg-surface p-3 sm:hidden"
      >
        <a
          href="#book"
          className="flex min-h-11 items-center justify-center rounded-md bg-brand-700 font-bold text-white"
        >
          {t('book')}
        </a>
        {venue.contactPhone ? (
          <a
            href={`tel:${venue.contactPhone}`}
            className="flex min-h-11 items-center justify-center gap-1 rounded-md border border-line font-medium"
          >
            <Icon name="phone" className="size-4" />
            {t('call')}
          </a>
        ) : (
          <span />
        )}
        <a
          href={directions}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-h-11 items-center justify-center gap-1 rounded-md border border-line font-medium"
        >
          <Icon name="pin" className="size-4" />
          {t('directions')}
        </a>
      </nav>
    </main>
  );
}
