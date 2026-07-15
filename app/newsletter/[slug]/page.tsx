import { getAllNewsletters, getNewsletter, extractSections } from '@/lib/newsletter';
import { NewsletterContent } from '@/components/newsletter/NewsletterContent';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { buildPageMetadata, getBaseUrl } from '@/lib/seo';

interface PageProps {
  params: Promise<{ slug: string }>;
}

function getIssueDescription(summary: string, date: string): string {
  const description = summary || `CipherScan Weekly issue published ${date}.`;
  if (description.length <= 160) return description;

  const candidate = description.slice(0, 159);
  const sentenceEnd = Math.max(
    candidate.lastIndexOf('.'),
    candidate.lastIndexOf('!'),
    candidate.lastIndexOf('?'),
  );
  if (sentenceEnd >= 90) return description.slice(0, sentenceEnd + 1);

  const wordEnd = candidate.lastIndexOf(' ');
  return `${description.slice(0, wordEnd > 0 ? wordEnd : 159).trimEnd()}…`;
}

export async function generateStaticParams() {
  return getAllNewsletters().map((n) => ({ slug: n.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const issue = getNewsletter(slug);
  if (!issue) {
    return buildPageMetadata({
      title: 'Newsletter Issue Not Found | CipherScan',
      description: 'This CipherScan Weekly newsletter issue could not be found.',
      path: `/newsletter/${encodeURIComponent(slug)}`,
      index: false,
      canonical: false,
      networks: ['mainnet'],
    });
  }

  return buildPageMetadata({
    title: `${issue.title} | CipherScan`,
    description: getIssueDescription(issue.summary, issue.date),
    path: `/newsletter/${issue.slug}`,
    type: 'article',
    networks: ['mainnet'],
    imageAlt: `${issue.title} from CipherScan Weekly`,
  });
}

export default async function NewsletterIssuePage({ params }: PageProps) {
  const { slug } = await params;
  const issue = getNewsletter(slug);
  if (!issue) notFound();

  const sections = extractSections(issue.content);
  const allIssues = getAllNewsletters();
  const currentIdx = allIssues.findIndex((n) => n.slug === slug);
  const prevIssue = currentIdx < allIssues.length - 1 ? allIssues[currentIdx + 1] : null;
  const nextIssue = currentIdx > 0 ? allIssues[currentIdx - 1] : null;
  const discussesIronwood = /\bironwood\b/i.test(issue.content);
  const baseUrl = getBaseUrl();
  const pageUrl = new URL(`/newsletter/${issue.slug}`, `${baseUrl}/`).toString();
  const description = getIssueDescription(issue.summary, issue.date);
  const datePublished = /^\d{4}-\d{2}-\d{2}$/.test(issue.date)
    ? `${issue.date}T00:00:00.000Z`
    : issue.date;
  const articleJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    '@id': `${pageUrl}#article`,
    url: pageUrl,
    headline: issue.title,
    description,
    datePublished,
    inLanguage: 'en-US',
    image: `${baseUrl}/og-image.png?v=2`,
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': pageUrl,
    },
    isPartOf: {
      '@type': 'WebSite',
      '@id': `${baseUrl}/#website`,
      name: 'CipherScan',
      url: `${baseUrl}/`,
    },
    author: {
      '@type': 'Organization',
      '@id': 'https://cipherscan.app/#organization',
      name: 'CipherScan',
      url: 'https://cipherscan.app',
    },
    publisher: {
      '@type': 'Organization',
      '@id': 'https://cipherscan.app/#organization',
      name: 'CipherScan',
      url: 'https://cipherscan.app',
      logo: {
        '@type': 'ImageObject',
        url: 'https://cipherscan.app/apple-touch-icon.png',
      },
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(articleJsonLd).replace(/</g, '\\u003c'),
        }}
      />
      <div className="relative max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-20">
      <Link
        href="/newsletter"
        className="inline-flex items-center gap-2 text-sm font-mono text-muted hover:text-cipher-cyan transition-colors mb-8"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        All issues
      </Link>

      <header className="nl-header mb-12 pb-8 border-b border-cipher-yellow/15">
        <div className="flex items-center gap-3 mb-4">
          {issue.issue > 0 && (
            <span className="text-xs font-mono text-cipher-yellow bg-cipher-yellow/10 rounded px-2 py-1">
              Edition #{issue.issue}
            </span>
          )}
          <time className="text-xs font-mono text-muted">
            {new Date(issue.date).toLocaleDateString('en-US', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </time>
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold text-primary mb-4 leading-tight tracking-tight">
          {issue.title}
        </h1>
        {issue.summary && (
          <p className="text-base sm:text-lg text-secondary leading-relaxed max-w-2xl">{issue.summary}</p>
        )}
      </header>

      {sections.length > 3 && (
        <details className="xl:hidden mb-10 border rounded-lg nl-toc-mobile">
          <summary className="px-4 py-3 text-sm font-mono text-muted cursor-pointer hover:text-primary transition-colors">
            Jump to section
          </summary>
          <nav className="px-4 pb-3 flex flex-wrap gap-2">
            {sections.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className="text-xs font-mono text-secondary hover:text-cipher-cyan transition-colors rounded px-2 py-1 nl-toc-pill"
              >
                {s.title.replace(/^Privacy Corner:\s*/i, 'Privacy Corner')}
              </a>
            ))}
          </nav>
        </details>
      )}

      <NewsletterContent content={issue.content} />

      {discussesIronwood && (
        <aside className="mt-10 rounded-xl border border-cipher-yellow/20 bg-cipher-yellow/5 p-5">
          <p className="text-xs font-mono text-cipher-yellow uppercase tracking-wider">Live Zcash data</p>
          <p className="text-sm text-secondary mt-2">
            Continue from this dated report with CipherScan&apos;s current Zcash Ironwood upgrade and
            Orchard migration data.
          </p>
          <Link href="/ironwood" className="inline-flex mt-3 text-sm font-mono text-cipher-cyan hover:underline">
            Open the Zcash Ironwood tracker →
          </Link>
        </aside>
      )}

      <nav className="mt-16 pt-8 border-t border-cipher-border flex items-center justify-between">
        {prevIssue ? (
          <Link
            href={`/newsletter/${prevIssue.slug}`}
            className="group flex items-center gap-2 text-sm font-mono text-muted hover:text-cipher-cyan transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            <span className="hidden sm:inline">{prevIssue.title}</span>
            <span className="sm:hidden">Previous</span>
          </Link>
        ) : (
          <div />
        )}
        {nextIssue ? (
          <Link
            href={`/newsletter/${nextIssue.slug}`}
            className="group flex items-center gap-2 text-sm font-mono text-muted hover:text-cipher-cyan transition-colors"
          >
            <span className="hidden sm:inline">{nextIssue.title}</span>
            <span className="sm:hidden">Next</span>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        ) : (
          <div />
        )}
      </nav>

      {sections.length > 3 && (
        <aside className="hidden xl:block absolute left-full top-0 ml-8 w-52" style={{ paddingTop: '12rem' }}>
          <div className="sticky top-24">
            <p className="text-[11px] font-mono text-muted uppercase tracking-wider mb-3">
              In this issue
            </p>
            <nav className="space-y-1.5 border-l border-cipher-border-alpha/40 pl-3">
              {sections.map((s) => (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  className="block text-[13px] text-muted hover:text-cipher-cyan transition-colors py-0.5 leading-snug"
                >
                  {s.title.replace(/^Privacy Corner:\s*/i, 'Privacy Corner')}
                </a>
              ))}
            </nav>

            <div className="mt-8 pt-6 border-t border-cipher-border-alpha/30">
              <a
                href="/newsletter/rss"
                className="flex items-center gap-2 text-xs font-mono text-muted hover:text-cipher-cyan transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6.18 15.64a2.18 2.18 0 0 1 2.18 2.18C8.36 19 7.38 20 6.18 20C5 20 4 19 4 17.82a2.18 2.18 0 0 1 2.18-2.18M4 4.44A15.56 15.56 0 0 1 19.56 20h-2.83A12.73 12.73 0 0 0 4 7.27V4.44m0 5.66a9.9 9.9 0 0 1 9.9 9.9h-2.83A7.07 7.07 0 0 0 4 12.93V10.1Z" />
                </svg>
                RSS Feed
              </a>
            </div>
          </div>
        </aside>
      )}
      </div>
    </>
  );
}
