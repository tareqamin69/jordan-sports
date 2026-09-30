import type { Locale } from '@jordan-sports/i18n';
import { PageHeader } from '@jordan-sports/ui';
import type { Metadata } from 'next';
import { getFormatter, getTranslations } from 'next-intl/server';
import { LEGAL_UPDATED_AT, legalDocs, type LegalDocId } from '@/content/legal';
import { Link } from '@/i18n/navigation';

const paths: Record<LegalDocId, string> = {
  terms: '/terms',
  venueTerms: '/venue-terms',
  privacy: '/privacy',
  howItWorks: '/how-it-works',
};

const related: Record<LegalDocId, LegalDocId[]> = {
  terms: ['howItWorks', 'privacy', 'venueTerms'],
  venueTerms: ['terms', 'privacy'],
  privacy: ['terms', 'howItWorks'],
  howItWorks: ['terms', 'privacy', 'venueTerms'],
};

async function docFor(id: LegalDocId, locale: Locale) {
  const tc = await getTranslations({ locale, namespace: 'common' });
  const appName = tc('appName');
  const fill = (text: string) => text.replaceAll('{appName}', appName);
  return { doc: legalDocs[id][locale], fill };
}

export async function legalMetadata(id: LegalDocId, locale: Locale): Promise<Metadata> {
  const { doc, fill } = await docFor(id, locale);
  const path = paths[id];
  return {
    title: fill(doc.title),
    description: fill(doc.description),
    alternates: {
      canonical: `/${locale}${path}`,
      languages: { ar: `/ar${path}`, en: `/en${path}` },
    },
  };
}

/** Renders one of the legal/help documents from content/legal.ts. */
export async function LegalDocument({ id, locale }: { id: LegalDocId; locale: Locale }) {
  const { doc, fill } = await docFor(id, locale);
  const tl = await getTranslations({ locale, namespace: 'web.legal' });
  const format = await getFormatter({ locale });

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-5 pb-10 pt-8 sm:px-8 sm:pt-12">
      <PageHeader title={fill(doc.title)} description={fill(doc.description)} />
      <article className="flex flex-col gap-8 text-ink" data-testid={`legal-${id}`}>
        {doc.intro ? <p className="text-lg leading-relaxed">{fill(doc.intro)}</p> : null}
        {doc.sections.map((section, i) => (
          <section key={i} id={section.id} className="flex scroll-mt-24 flex-col gap-3">
            <h2 className="font-display text-2xl leading-tight">{fill(section.heading)}</h2>
            {section.paragraphs.map((p, j) => (
              <p key={j} className="leading-relaxed">
                {fill(p)}
              </p>
            ))}
            {section.faq ? (
              <div className="flex flex-col gap-2">
                {section.faq.map((item, j) => (
                  <details
                    key={j}
                    className="group rounded-tile border border-line bg-surface p-4 open:border-line-strong"
                  >
                    <summary className="cursor-pointer list-none font-semibold marker:hidden">
                      {fill(item.q)}
                    </summary>
                    <p className="mt-2 leading-relaxed text-ink-muted">{fill(item.a)}</p>
                  </details>
                ))}
              </div>
            ) : null}
          </section>
        ))}
      </article>
      <nav
        aria-label={tl('related')}
        className="mt-10 flex flex-wrap gap-x-5 gap-y-2 border-t border-line pt-5 text-sm"
      >
        {related[id].map((other) => (
          <Link
            key={other}
            href={paths[other]}
            className="font-medium text-primary hover:underline"
          >
            {fill(legalDocs[other][locale].title)}
          </Link>
        ))}
      </nav>
      <p className="mt-6 text-sm text-ink-muted">
        {tl('lastUpdated', {
          date: format.dateTime(new Date(`${LEGAL_UPDATED_AT}T12:00:00Z`), {
            dateStyle: 'long',
            numberingSystem: 'latn',
          }),
        })}
      </p>
    </main>
  );
}
