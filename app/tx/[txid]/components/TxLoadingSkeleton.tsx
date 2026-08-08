'use client';

import { Card, CardBody } from '@/components/ui/Card';

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-cipher-border ${className}`} />;
}

export function TxLoadingSkeleton() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-12 animate-fade-in">
      <div className="mb-6">
        <Skeleton className="h-3 w-20 mb-2" />
        <Skeleton className="h-5 w-48 sm:w-64 mb-4" />
        <div className="flex items-center gap-2 mb-4">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-6 w-20" />
        </div>
        <Card>
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
      <div className="flex items-center gap-6 border-b border-cipher-border mb-6">
        <Skeleton className="h-4 w-20 mb-2" />
        <Skeleton className="h-4 w-28 mb-2" />
      </div>
      <Card>
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
