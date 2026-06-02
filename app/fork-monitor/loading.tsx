'use client';

import { Card, CardBody } from '@/components/ui/Card';

function SkeletonLine({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-cipher-border-alpha/40 ${className}`} />;
}

export default function ForkMonitorLoading() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 animate-fade-in">
      <div className="mb-8">
        <span className="text-[10px] font-mono text-muted tracking-wider">&gt; FORK_MONITOR</span>
        <h1 className="text-2xl sm:text-3xl font-bold font-mono text-primary mt-1">Crosslink Fork Monitor</h1>
        <SkeletonLine className="h-4 w-full max-w-2xl mt-2" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i} variant="compact">
            <CardBody className="py-4">
              <SkeletonLine className="h-7 w-24 mb-2" />
              <SkeletonLine className="h-3 w-16" />
            </CardBody>
          </Card>
        ))}
      </div>

      <Card>
        <CardBody className="p-4 sm:p-5">
          <SkeletonLine className="h-4 w-40 mb-4" />
          <SkeletonLine className="h-24 w-full" />
        </CardBody>
      </Card>
    </div>
  );
}
