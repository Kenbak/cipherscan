'use client';

import { Card, CardBody } from '@/components/ui/Card';

function SkeletonLine({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-cipher-border-alpha/40 ${className}`} />;
}

export default function ForkMonitorLoading() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-12 animate-fade-in">
      <div className="mb-6">
        <p className="text-xs text-muted font-mono uppercase tracking-widest mb-3">
          <span className="opacity-50">{'>'}</span> FORK MONITOR
        </p>
        <h1 className="text-2xl sm:text-3xl font-bold text-primary mb-2">
          Crosslink Fork Monitor
        </h1>
        <SkeletonLine className="h-4 w-full max-w-2xl" />
      </div>

      <Card className="mb-6">
        <CardBody className="p-4 sm:p-5">
          <div className="flex items-center justify-between mb-4">
            <SkeletonLine className="h-4 w-32" />
            <SkeletonLine className="h-5 w-20" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[0, 1].map((i) => (
              <div key={i} className="card p-4">
                <SkeletonLine className="h-4 w-28 mb-4" />
                <div className="space-y-3">
                  <SkeletonLine className="h-3 w-full" />
                  <SkeletonLine className="h-3 w-5/6" />
                  <SkeletonLine className="h-3 w-3/4" />
                </div>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="p-4 sm:p-5">
          <SkeletonLine className="h-4 w-40 mb-4" />
          <div className="space-y-2">
            {[0, 1, 2, 3].map((i) => (
              <SkeletonLine key={i} className="h-8 w-full" />
            ))}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
