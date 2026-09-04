'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Card, CardBody } from '@/components/ui/Card';

/**
 * Route-level error boundary for `/address/[address]`. Catches render-time
 * exceptions in the client tree that the page's own try/catch-based data
 * fetching does not.
 */
export default function AddressError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[address detail] render error:', error);
  }, [error]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <Card role="alert" ariaLive="assertive">
        <CardBody>
          <div className="text-center py-12">
            <div className="w-14 h-14 mx-auto mb-5 rounded-xl bg-cipher-surface border border-glass-4 flex items-center justify-center" aria-hidden="true">
              <svg className="w-7 h-7 text-danger" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-primary mb-2">Something Went Wrong</h2>
            <p className="text-sm text-secondary max-w-md mx-auto mb-6">
              CipherScan hit an unexpected error rendering this address. This has been logged.
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
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
