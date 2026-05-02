import { getAllNewsletters, getNewsletter, markdownToHtml, extractSections } from '@/lib/newsletter';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return getAllNewsletters().map((n) => ({ slug: n.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const issue = getNewsletter(slug);
  if (!issue) return { title: 'Not Found | CipherScan' };

  return {
    title: `${issue.title} | CipherScan Weekly`,
    description: issue.summary || `CipherScan Weekly issue from ${issue.date}`,
  };
}

export default async function NewsletterIssuePage({ params }: PageProps) {
  const { slug } = await params;
  const issue = getNewsletter(slug);
  if (!issue) notFound();

  const contentHtml = markdownToHtml(issue.content);
  const sections = extractSections(issue.content);
  const allIssues = getAllNewsletters();
  const currentIdx = allIssues.findIndex((n) => n.slug === slug);
  const prevIssue = currentIdx < allIssues.length - 1 ? allIssues[currentIdx + 1] : null;
  const nextIssue = currentIdx > 0 ? allIssues[currentIdx - 1] : null;

  return (
    <div className="relative max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-20">
      {/* Back link */}
      <Link
        href="/newsletter"
        className="inline-flex items-center gap-2 text-sm font-mono text-muted hover:text-cipher-cyan transition-colors mb-8"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        All issues
      </Link>

      {/* Header */}
      <header className="mb-14 pb-8 border-b border-cipher-yellow/15">
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
        <h1 className="text-3xl sm:text-4xl font-bold font-mono text-primary mb-5 leading-tight">
          {issue.title}
        </h1>
        {issue.summary && (
          <p className="text-base text-secondary leading-relaxed">{issue.summary}</p>
        )}
      </header>

      {/* Mobile TOC */}
      {sections.length > 3 && (
        <details className="xl:hidden mb-10 border rounded-lg" style={{ background: 'var(--glass-2)', borderColor: 'var(--color-border-subtle)' }}>
          <summary className="px-4 py-3 text-sm font-mono text-muted cursor-pointer hover:text-primary transition-colors">
            Jump to section
          </summary>
          <nav className="px-4 pb-3 flex flex-wrap gap-2">
            {sections.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className="text-xs font-mono text-secondary hover:text-cipher-cyan transition-colors rounded px-2 py-1"
                style={{ background: 'var(--glass-3)' }}
              >
                {s.title}
              </a>
            ))}
          </nav>
        </details>
      )}

      {/* Content */}
      <article
        className="newsletter-content"
        dangerouslySetInnerHTML={{ __html: contentHtml }}
      />

      {/* Navigation */}
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
        ) : <div />}
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
        ) : <div />}
      </nav>

      {/* Desktop TOC — positioned outside content flow */}
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
                  className="block text-[13px] font-mono text-muted hover:text-cipher-cyan transition-colors py-0.5 leading-snug"
                >
                  {s.title}
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
  );
}
