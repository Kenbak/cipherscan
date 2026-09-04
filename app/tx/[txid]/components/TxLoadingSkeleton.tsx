'use client';

import { Card, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { formatRelativeTime } from '@/lib/utils';
import type { TxMeta } from '@/lib/seo';

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-cipher-border ${className}`} />;
}

function statusColor(status: TxMeta['status']): 'green' | 'amber' | 'orange' | 'muted' {
  if (status === 'confirmed') return 'green';
  if (status === 'pending') return 'amber';
  if (status === 'stale') return 'orange';
  return 'muted';
}

function statusLabel(status: TxMeta['status']): string {
  if (status === 'confirmed') return 'CONFIRMED';
  if (status === 'pending') return 'PENDING';
  if (status === 'stale') return 'REORGANIZED';
  return 'UNKNOWN';
}

export function TxLoadingSkeleton({ initialMeta = null }: { initialMeta?: TxMeta | null } = {}) {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-12 animate-fade-in">
      {/* Screen-reader announcement for the async fetch in progress — the
          visual content below (real facts when available, else a skeleton)
          is marked aria-hidden so this is the single source of truth for AT. */}
      <div role="status" aria-live="polite" className="sr-only">
        Loading transaction details{initialMeta ? ` for a ${statusLabel(initialMeta.status).toLowerCase()} transaction` : ''}…
      </div>

      <div className="mb-6">
        <Skeleton className="h-3 w-20 mb-2" />
        <Skeleton className="h-5 w-48 sm:w-64 mb-4" />

        {initialMeta ? (
          // Server-seeded initial content from getTxResolution — real facts
          // instead of a shimmer while the full transaction detail loads.
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <Badge color={statusColor(initialMeta.status)}>{statusLabel(initialMeta.status)}</Badge>
            {initialMeta.status === 'confirmed' && (
              <span className="text-xs font-mono text-secondary">
                Block #{initialMeta.blockHeight.toLocaleString()} · {initialMeta.confirmations.toLocaleString()} confirmation{initialMeta.confirmations === 1 ? '' : 's'} · {formatRelativeTime(initialMeta.timestamp)}
              </span>
            )}
            {initialMeta.hasShielded && <Badge color="purple">SHIELDED</Badge>}
          </div>
        ) : (
          <div className="flex items-center gap-2 mb-4" aria-hidden="true">
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-6 w-20" />
          </div>
        )}

        <Card aria-hidden="true">
          <CardBody>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-4 py-3">
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-4 w-4 rounded-full" />
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-4 w-4 rounded-full" />
              <Skeleton className="h-5 w-28" />
            </div>
            <Skeleton className="h-4 w-full max-w-md mt-3" />
            <Skeleton className="h-4 w-3/4 max-w-sm mt-2" />
          </CardBody>
        </Card>
      </div>
      <div className="flex items-center gap-6 border-b border-cipher-border mb-6" aria-hidden="true">
        <Skeleton className="h-4 w-20 mb-2" />
        <Skeleton className="h-4 w-28 mb-2" />
      </div>
      <Card aria-hidden="true">
        <CardBody>
          <div className="space-y-4">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="flex items-center gap-4 py-3 border-b border-cipher-border last:border-0"
              >
                <Skeleton className="h-4 w-24 sm:w-32" />
                <Skeleton className="h-4 flex-1 max-w-xs" />
              </div>
            ))}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
