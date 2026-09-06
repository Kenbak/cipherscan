import { SkeletonTable } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import type { AddressMeta } from '@/lib/seo';



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
          <div className="flex flex-col items-center text-center space-y-3 py-2">
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
          <SkeletonTable rows={5} columns={5} label={null} />
        </CardBody>
      </Card>
    </div>
  );
}

export function AddressPageSuspenseFallback({ initialMeta }: { initialMeta?: AddressMeta | null } = {}) {
  return <AddressLoadingSkeleton initialMeta={initialMeta} />;
}
