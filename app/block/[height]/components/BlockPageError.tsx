import Link from 'next/link';
import { Card, CardBody } from '@/components/ui/Card';
import type { BlockPageSummary } from './types';

export function BlockPageError({
  identifier,
  initialSummary,
  loadError,
}: {
  identifier: string;
  initialSummary: BlockPageSummary | null;
  loadError: 'not-found' | 'unavailable' | null;
}) {
  const temporarilyUnavailable = loadError === 'unavailable';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Card className="text-center" role="alert" ariaLive="assertive">
        <CardBody className="py-16">
          <div className="text-5xl mb-6" aria-hidden="true">{temporarilyUnavailable ? '⚠️' : '🔍'}</div>
          <h1 className="text-2xl font-bold font-mono text-primary mb-3">
            {temporarilyUnavailable ? 'Block Data Temporarily Unavailable' : 'Block No Longer Available'}
          </h1>
          <p className="text-secondary mb-3">
            {temporarilyUnavailable
              ? 'CipherScan could not refresh this block from the block index. Please try again shortly.'
              : 'This block is no longer present in the block index.'}
          </p>
          {initialSummary ? (
            <p className="text-xs text-muted mb-6">
              Last known status: {initialSummary.isOrphaned ? 'orphaned' : 'canonical'}. Full block hash:{' '}
              <code className="font-mono text-secondary break-all">{initialSummary.hash}</code>
            </p>
          ) : (
            <p className="text-xs text-muted mb-6">
              Block identifier:{' '}
              <code className="font-mono text-secondary break-all">{identifier}</code>
            </p>
          )}
          <Link href="/" className="text-cipher-cyan hover:text-cipher-green transition-colors font-mono text-sm">
            ← Back to Explorer
          </Link>
        </CardBody>
      </Card>
    </div>
  );
}
