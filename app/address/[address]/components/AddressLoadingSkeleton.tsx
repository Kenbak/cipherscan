import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import type { AddressMeta } from '@/lib/seo';

function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded bg-cipher-border ${className}`} />
  );
}

function typeLabel(type: AddressMeta['type']): string {
  if (type === 'shielded') return 'SHIELDED';
  if (type === 'unified') return 'UNIFIED';
  return 'TRANSPARENT';
}

export function AddressLoadingSkeleton({
  initialMeta = null,
  address,
}: { initialMeta?: AddressMeta | null; address?: string } = {}) {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-12 animate-fade-in">
      {/* Screen-reader announcement — visual skeleton below is aria-hidden. */}
      <div role="status" aria-live="polite" className="sr-only">
        Loading address activity{address ? ` for ${address}` : ''}…
      </div>

      {/* Header skeleton */}
      <div className="mb-6">
        <Skeleton className="h-3 w-32 mb-3" />
        {initialMeta ? (
          // Server-seeded initial content from getAddressResolution — real
          // type/balance/tx-count facts instead of a shimmer while the full
          // paginated transaction history loads client-side.
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <Badge color={initialMeta.type === 'shielded' ? 'purple' : 'muted'}>{typeLabel(initialMeta.type)}</Badge>
            {!initialMeta.isShielded && (
              <span className="text-xs font-mono text-secondary">
                {initialMeta.balance.toFixed(4)} ZEC · {initialMeta.txCount.toLocaleString()} tx{initialMeta.txCount === 1 ? '' : 's'}
              </span>
            )}
          </div>
        ) : (
          <Skeleton className="h-5 w-20 mb-3 rounded-full" aria-hidden="true" />
        )}
        <Skeleton className="h-4 w-full max-w-md" aria-hidden="true" />
      </div>

      {/* Hero card skeleton */}
      <Card className="mb-6" aria-hidden="true">
        <CardBody>
          <div className="space-y-3">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-4 w-full max-w-lg" />
          </div>
        </CardBody>
      </Card>

      {/* Tab bar skeleton */}
      <div className="flex items-center gap-6 border-b border-cipher-border mb-6 md:mb-8" aria-hidden="true">
        <Skeleton className="h-4 w-28 mb-2" />
        <Skeleton className="h-4 w-24 mb-2" />
      </div>

      {/* Transaction list skeleton */}
      <Card aria-hidden="true">
        <CardHeader>
          <Skeleton className="h-3 w-32" />
        </CardHeader>
        <CardBody>
          <div className="space-y-3">
            {[0, 1, 2, 3, 4].map((i) => (
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

export function AddressPageSuspenseFallback({ initialMeta }: { initialMeta?: AddressMeta | null } = {}) {
  return (
    <div
      className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8"
      role="status"
      aria-live="polite"
      aria-label="Loading address activity"
    >
      <div className="h-48 rounded-xl border border-cipher-border bg-cipher-surface animate-pulse" aria-hidden="true" />
      {initialMeta && <span className="sr-only">{typeLabel(initialMeta.type)} address, {initialMeta.txCount.toLocaleString()} transactions.</span>}
    </div>
  );
}
