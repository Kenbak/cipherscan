import { getAllNewsletters, getNewsletter, markdownToHtml } from '@/lib/newsletter';
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
  const allIssues = getAllNewsletters();
  const currentIdx = allIssues.findIndex((n) => n.slug === slug);
  const prevIssue = currentIdx < allIssues.length - 1 ? allIssues[currentIdx + 1] : null;
  const nextIssue = currentIdx > 0 ? allIssues[currentIdx - 1] : null;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-20">
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
      <header className="mb-12 border-b border-cipher-border pb-8">
        <div className="flex items-center gap-3 mb-4">
          {issue.issue > 0 && (
            <span className="text-xs font-mono text-cipher-cyan bg-cipher-cyan/10 rounded px-2 py-1">
              Issue #{issue.issue}
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
        <h1 className="text-3xl sm:text-4xl font-bold font-mono text-primary mb-4">
          {issue.title}
        </h1>
        {issue.summary && (
          <p className="text-lg text-secondary leading-relaxed">{issue.summary}</p>
        )}
      </header>

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
    </div>
  );
}
