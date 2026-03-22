import { getAllNewsletters } from '@/lib/newsletter';
import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Newsletter | CipherScan',
  description: 'Weekly Zcash intelligence — protocol updates, network stats, and privacy insights. No tracking. No surveillance.',
};

export default function NewsletterPage() {
  const newsletters = getAllNewsletters();
  const hasIssues = newsletters.length > 0;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
      {/* Hero */}
      <div className="mb-16 animate-fade-in">
        <p className="text-xs text-muted font-mono uppercase tracking-[0.3em] mb-4">
          <span className="opacity-50">{'>'}</span> NEWSLETTER
        </p>
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold font-mono text-primary mb-6">
          CipherScan Weekly
        </h1>
        <p className="text-lg sm:text-xl text-secondary max-w-2xl leading-relaxed">
          Weekly Zcash intelligence — protocol updates, network stats, and privacy insights.
          No tracking pixels. No surveillance. Just signal.
        </p>

        {/* RSS link */}
        <div className="mt-6 flex items-center gap-4">
          <a
            href="/newsletter/rss"
            className="inline-flex items-center gap-2 text-sm font-mono text-cipher-cyan hover:text-cipher-cyan-bright transition-colors"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6.18 15.64a2.18 2.18 0 0 1 2.18 2.18C8.36 19 7.38 20 6.18 20C5 20 4 19 4 17.82a2.18 2.18 0 0 1 2.18-2.18M4 4.44A15.56 15.56 0 0 1 19.56 20h-2.83A12.73 12.73 0 0 0 4 7.27V4.44m0 5.66a9.9 9.9 0 0 1 9.9 9.9h-2.83A7.07 7.07 0 0 0 4 12.93V10.1Z" />
            </svg>
            Subscribe via RSS
          </a>
        </div>
      </div>

      {hasIssues ? (
        /* Issue list */
        <div className="space-y-4 animate-fade-in-up" style={{ animationDelay: '100ms' }}>
          {newsletters.map((issue) => (
            <Link
              key={issue.slug}
              href={`/newsletter/${issue.slug}`}
              className="block group"
            >
              <div className="card p-6 transition-all hover:border-cipher-cyan/30">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      {issue.issue > 0 && (
                        <span className="text-[10px] font-mono text-cipher-yellow bg-cipher-yellow/10 rounded px-2 py-0.5">
                          #{issue.issue}
                        </span>
                      )}
                      <span className="text-xs font-mono text-muted">
                        {new Date(issue.date).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })}
                      </span>
                    </div>
                    <h2 className="text-lg font-bold text-primary font-mono group-hover:text-cipher-cyan transition-colors">
                      {issue.title}
                    </h2>
                    {issue.summary && (
                      <p className="text-sm text-secondary mt-2 line-clamp-2">{issue.summary}</p>
                    )}
                  </div>
                  <svg className="w-5 h-5 text-muted group-hover:text-cipher-cyan transition-colors mt-1 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        /* Coming soon state */
        <div className="animate-fade-in-up" style={{ animationDelay: '100ms' }}>
          <div className="border border-cipher-border rounded-2xl p-8 sm:p-12 card-surface text-center">
            <div className="w-16 h-16 rounded-2xl bg-cipher-cyan/10 flex items-center justify-center mx-auto mb-6">
              <svg className="w-8 h-8 text-cipher-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 7.5h1.5m-1.5 3h1.5m-7.5 3h7.5m-7.5 3h7.5m3-9h3.375c.621 0 1.125.504 1.125 1.125V18a2.25 2.25 0 01-2.25 2.25M16.5 7.5V18a2.25 2.25 0 002.25 2.25M16.5 7.5V4.875c0-.621-.504-1.125-1.125-1.125H4.125C3.504 3.75 3 4.254 3 4.875V18a2.25 2.25 0 002.25 2.25h13.5M6 7.5h3v3H6v-3z" />
              </svg>
            </div>

            <span className="inline-block text-xs font-mono text-cipher-yellow bg-cipher-yellow/10 rounded-full px-3 py-1 mb-4">
              Coming Soon
            </span>

            <h2 className="text-2xl font-bold font-mono text-primary mb-4">
              First issue dropping soon
            </h2>
            <p className="text-secondary max-w-md mx-auto mb-8 leading-relaxed">
              A weekly digest of Zcash protocol updates, on-chain analytics,
              privacy insights, and ecosystem news — curated with zero tracking.
            </p>

            {/* What to expect */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-lg mx-auto text-left">
              <div className="bg-cipher-bg/50 rounded-lg p-4">
                <div className="text-cipher-green text-sm font-mono font-bold mb-1">Protocol</div>
                <div className="text-xs text-muted">Network upgrades, consensus changes, ZIP proposals</div>
              </div>
              <div className="bg-cipher-bg/50 rounded-lg p-4">
                <div className="text-cipher-cyan text-sm font-mono font-bold mb-1">On-Chain</div>
                <div className="text-xs text-muted">Shielded pool flows, node stats, mining trends</div>
              </div>
              <div className="bg-cipher-bg/50 rounded-lg p-4">
                <div className="text-cipher-purple text-sm font-mono font-bold mb-1">Privacy</div>
                <div className="text-xs text-muted">Privacy tips, risk analysis, ecosystem insights</div>
              </div>
            </div>
          </div>

          {/* Privacy promise */}
          <div className="mt-8 text-center">
            <p className="text-xs text-muted font-mono">
              No tracking pixels · No open-rate surveillance · RSS-first distribution
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
