import { Card, CardHeader, CardBody } from '@/components/ui/Card';

function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded bg-cipher-border ${className}`} />
  );
}

export function AddressLoadingSkeleton() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-12 animate-fade-in">
      {/* Header skeleton */}
      <div className="mb-6">
        <Skeleton className="h-3 w-32 mb-3" />
        <Skeleton className="h-5 w-20 mb-3 rounded-full" />
        <Skeleton className="h-4 w-full max-w-md" />
      </div>

      {/* Hero card skeleton */}
      <Card className="mb-6">
        <CardBody>
          <div className="space-y-3">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-4 w-full max-w-lg" />
          </div>
        </CardBody>
      </Card>

      {/* Tab bar skeleton */}
      <div className="flex items-center gap-6 border-b border-cipher-border mb-6 md:mb-8">
        <Skeleton className="h-4 w-28 mb-2" />
        <Skeleton className="h-4 w-24 mb-2" />
      </div>

      {/* Transaction list skeleton */}
      <Card>
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

export function AddressPageSuspenseFallback() {
  return (
    <div
      className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8"
      aria-busy="true"
      aria-label="Loading address activity"
    >
      <div className="h-48 rounded-xl border border-cipher-border bg-cipher-surface animate-pulse" />
    </div>
  );
}
