import { getVenue, type PublicVenue } from '@jordan-sports/contracts';
import type { Locale } from '@jordan-sports/i18n';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { VenueAvailability } from '@/components/venue-availability';
import { joinList, pick } from '@/lib/localized';
import { isNotFound, serverApi, siteUrl } from '@/lib/server-api';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ locale: Locale; slug: string }> };

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
      addressLocality: pick(venue.city.name, locale),
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

export default async function VenuePage({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const venue = await loadVenue(slug);
  if (!venue) notFound();
  const t = await getTranslations('web.venue');
  const name = pick(venue.name, locale);
  const url = `${siteUrl}/${locale}/venues/${slug}`;
  const place = [
    pick(venue.address, locale),
    venue.area ? pick(venue.area.name, locale) : '',
    pick(venue.city.name, locale),
  ].filter(Boolean);
  const whatsapp = `https://wa.me/?text=${encodeURIComponent(`${t('shareText', { name })} ${url}`)}`;

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(venue, locale, url) }}
      />

      {venue.media.length > 0 ? (
        <div className="mb-6 flex snap-x gap-3 overflow-x-auto rounded-lg">
          {venue.media.map((m, i) => (
            // eslint-disable-next-line @next/next/no-img-element -- images are served by our API (already optimized WebP)
            <img
              key={m.id}
              src={`/api${m.url}`}
              alt={t('photoAlt', { name })}
              width={m.width}
              height={m.height}
              loading={i === 0 ? 'eager' : 'lazy'}
              className="aspect-video w-11/12 shrink-0 snap-start rounded-lg object-cover sm:w-2/3"
            />
          ))}
        </div>
      ) : null}

      <h1 className="text-3xl font-bold sm:text-4xl">{name}</h1>
      <p className="mt-2 text-ink-muted">
        {joinList(
          venue.sports.map((s) => pick(s.name, locale)),
          locale,
        )}
      </p>

      <div className="mt-6 flex flex-wrap gap-3">
        {venue.contactPhone ? (
          <a
            href={`tel:${venue.contactPhone}`}
            className="rounded-md bg-brand-700 px-4 py-2.5 font-medium text-white hover:bg-brand-800"
          >
            {t('contact')}
          </a>
        ) : null}
        <a
          href={whatsapp}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-md border border-line bg-surface px-4 py-2.5 font-medium text-ink hover:bg-canvas"
        >
          {t('share')}
        </a>
      </div>

      <div className="mt-10 grid gap-8 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-8 lg:col-span-2">
          {pick(venue.description, locale) ? (
            <section>
              <h2 className="text-xl font-bold">{t('about')}</h2>
              <p className="mt-3 whitespace-pre-line text-ink">{pick(venue.description, locale)}</p>
            </section>
          ) : null}
          <VenueAvailability
            slug={venue.slug}
            timezone={venue.timezone}
            resources={venue.resources}
          />
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
          {place.length > 0 ? (
            <section>
              <h2 className="text-lg font-bold">{t('address')}</h2>
              <p className="mt-2 text-ink">{joinList(place, locale)}</p>
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
    </main>
  );
}
