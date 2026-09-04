import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { formatRelativeTime } from '@/lib/utils';
import { formatBytesCompact } from '@/lib/format-numbers';
import type { BlockPageSummary } from './types';

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-cipher-border ${className}`} />;
}

export function BlockPageSkeleton({
  identifier,
  initialSummary,
}: {
  identifier: string;
  initialSummary: BlockPageSummary | null;
}) {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 animate-fade-in">
      <div className="mb-6">
        <span className="text-[10px] font-mono text-muted tracking-wider">&gt; BLOCK_DETAILS</span>
        <div className="flex flex-wrap items-center gap-3 mt-1">
          <h1 className={`text-xl sm:text-2xl md:text-3xl font-bold font-mono ${initialSummary?.isOrphaned ? 'text-cipher-orange' : 'text-primary'}`}>
            {initialSummary
              ? `${initialSummary.isOrphaned ? 'Orphaned Zcash Block' : 'Zcash Block'} #${initialSummary.height.toLocaleString()}`
              : 'Zcash Block'}
          </h1>
          {initialSummary && (
            <Badge color={initialSummary.isOrphaned ? 'orange' : 'green'}>
              {initialSummary.isOrphaned ? 'ORPHAN' : 'CANONICAL'}
            </Badge>
          )}
        </div>
        <p className="mt-3 text-xs sm:text-sm text-secondary">
          {initialSummary ? (
            <>
              {initialSummary.isOrphaned
                ? 'This block is no longer part of the canonical Zcash chain.'
                : 'This block is part of the canonical Zcash chain.'}{' '}
              Full block hash:{' '}
              <code className="font-mono text-primary break-all">{initialSummary.hash}</code>
            </>
          ) : (
            <>
              Loading block identifier:{' '}
              <code className="font-mono text-primary break-all">{identifier}</code>
            </>
          )}
        </p>
        {/* Server-seeded facts from the SEO resolution fetch — real content
            instead of a shimmer while the full block detail loads client-side. */}
        {initialSummary && (initialSummary.timestamp != null || initialSummary.transactionCount != null || initialSummary.size != null) && (
          <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs font-mono text-muted">
            {initialSummary.timestamp != null && (
              <div className="flex items-center gap-1.5">
                <dt className="text-muted/60">Mined</dt>
                <dd className="text-secondary">{formatRelativeTime(initialSummary.timestamp)}</dd>
              </div>
            )}
            {initialSummary.transactionCount != null && (
              <div className="flex items-center gap-1.5">
                <dt className="text-muted/60">Transactions</dt>
                <dd className="text-secondary">{initialSummary.transactionCount.toLocaleString()}</dd>
              </div>
            )}
            {initialSummary.size != null && (
              <div className="flex items-center gap-1.5">
                <dt className="text-muted/60">Size</dt>
                <dd className="text-secondary">{formatBytesCompact(initialSummary.size)}</dd>
              </div>
            )}
          </dl>
        )}
      </div>
      <div role="status" aria-live="polite" className="sr-only">
        Loading full block details for block {initialSummary ? `#${initialSummary.height.toLocaleString()}` : identifier}…
      </div>
      <Card className="mb-6" aria-hidden="true">
        <CardBody>
          <div className="space-y-4">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-48" />
              </div>
            ))}
            <Skeleton className="h-12 w-full rounded-lg" />
          </div>
        </CardBody>
      </Card>
      <Card aria-hidden="true">
        <CardHeader><Skeleton className="h-4 w-32" /></CardHeader>
        <CardBody>
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="p-3 rounded-lg border border-cipher-border">
                <div className="flex items-center gap-4">
                  <Skeleton className="h-5 w-10" />
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-4 w-16 ml-auto" />
                </div>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
