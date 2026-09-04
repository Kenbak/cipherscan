'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Card, CardBody } from '@/components/ui/Card';

/**
 * Route-level error boundary for `/block/[height]`. Catches render-time
 * exceptions in the client tree (BlockPageClient and children) that the
 * component's own try/catch-based data fetching does not — e.g. a
 * transform throwing on an unexpected API shape.
 */
export default function BlockError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[block detail] render error:', error);
  }, [error]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Card className="text-center" role="alert" ariaLive="assertive">
        <CardBody className="py-16">
          <div className="text-5xl mb-6" aria-hidden="true">⚠️</div>
          <h1 className="text-2xl font-bold font-mono text-primary mb-3">Something Went Wrong</h1>
          <p className="text-secondary mb-6">
            CipherScan hit an unexpected error rendering this block. This has been logged.
          </p>
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={reset}
              className="text-cipher-cyan hover:text-cipher-green transition-colors font-mono text-sm"
            >
              Try again
            </button>
            <Link href="/" className="text-cipher-cyan hover:text-cipher-green transition-colors font-mono text-sm">
              ← Back to Explorer
            </Link>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
