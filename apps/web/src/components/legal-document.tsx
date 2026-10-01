import type { Locale } from '@jordan-sports/i18n';
import { PageHeader } from '@jordan-sports/ui';
import type { Metadata } from 'next';
import { getFormatter, getTranslations } from 'next-intl/server';
import { LEGAL_UPDATED_AT, legalDocs, type LegalDocId } from '@/content/legal';
import { Link } from '@/i18n/navigation';
import { Icon } from './icons';

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

const isSteps = (paragraphs: string[]) =>
  paragraphs.length > 1 && paragraphs.every((p) => /^\d+\.\s/.test(p));

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
            {isSteps(section.paragraphs) ? (
              // "1. …", "2. …": numbered step cards.
              <ol className="flex flex-col gap-2.5">
                {section.paragraphs.map((p, j) => {
                  const [, n, text] = /^(\d+)\.\s*(.*)$/s.exec(p)!;
                  return (
                    <li
                      key={j}
                      className="flex items-start gap-3 rounded-tile border border-line bg-surface p-4"
                    >
                      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-sm font-bold text-on-primary">
                        {n}
                      </span>
                      <span className="leading-relaxed">{fill(text!)}</span>
                    </li>
                  );
                })}
              </ol>
            ) : (
              section.paragraphs.map((p, j) => (
                <p key={j} className="leading-relaxed">
                  {fill(p)}
                </p>
              ))
            )}
            {section.faq ? (
              <div className="flex flex-col gap-2">
                {section.faq.map((item, j) => (
                  <details
                    key={j}
                    className="group rounded-tile border border-line bg-surface p-4 open:border-line-strong"
                  >
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-semibold marker:hidden [&::-webkit-details-marker]:hidden">
                      {fill(item.q)}
                      <Icon
                        name="chevron"
                        className="size-4 shrink-0 rotate-90 text-ink-muted transition-transform duration-base group-open:-rotate-90"
                      />
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
