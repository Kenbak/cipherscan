import { forwardRef } from 'react';
import Link from 'next/link';
import { CURRENCY } from '@/lib/config';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { BlockTransactionRow } from './BlockTransactionRow';
import type { BlockData } from './types';

export const BlockTransactionsSection = forwardRef<HTMLDivElement, { data: BlockData }>(
  function BlockTransactionsSection({ data }, ref) {
    if (data.isOrphaned) return null;

    return (
      <Card ref={ref}>
        <CardHeader>
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-secondary uppercase tracking-wider">
                Transactions
              </h2>
              <Badge color="muted">{data.transactionCount}</Badge>
            </div>
            <div className="flex items-center gap-1">
              <Link
                href={`/block/${data.height - 1}`}
                className={`p-1.5 rounded transition-colors ${
                  data.previousBlockHash
                    ? 'text-secondary hover:text-primary hover:bg-glass-4'
                    : 'text-muted cursor-not-allowed pointer-events-none'
                }`}
                title={`Block #${(data.height - 1).toLocaleString()}`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </Link>
              <span className="text-xs font-mono text-muted">#{data.height.toLocaleString()}</span>
              <Link
                href={`/block/${data.height + 1}`}
                className={`p-1.5 rounded transition-colors ${
                  data.nextBlockHash
                    ? 'text-secondary hover:text-primary hover:bg-glass-4'
                    : 'text-muted cursor-not-allowed pointer-events-none'
                }`}
                title={`Block #${(data.height + 1).toLocaleString()}`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </div>
          </div>
        </CardHeader>
        <CardBody>

        {data.isOrphaned ? (
          <div className="text-center py-12">
            <p className="text-sm text-secondary font-mono">Transaction data not stored for orphaned blocks</p>
            {data.canonicalBlock && (
              <Link
                href={`/block/${data.canonicalBlock.height}`}
                className="inline-block mt-3 text-xs font-mono text-cipher-green hover:underline"
              >
                View canonical block at #{data.canonicalBlock.height.toLocaleString()}
              </Link>
            )}
          </div>
        ) : !data.transactions || data.transactions.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-secondary font-mono text-sm">No transaction details available</p>
          </div>
        ) : (
          <div className="overflow-x-auto -mx-6 px-6">
            <div className="min-w-[960px] grid grid-cols-13 gap-3 px-4 py-2 mb-2 text-xs font-semibold text-muted uppercase tracking-wider border-b block-info-border">
              <div className="col-span-1">#</div>
              <div className="col-span-1">Type</div>
              <div className="col-span-2">Hash</div>
              <div className="col-span-2">From</div>
              <div className="col-span-2">To</div>
              <div className="col-span-1 text-center">Ins</div>
              <div className="col-span-1 text-center">Outs</div>
              <div className="col-span-1 text-right whitespace-nowrap">Value ({CURRENCY})</div>
              <div className="col-span-1 text-right">Fee</div>
            </div>

            <div className="space-y-2 min-w-[960px]">
              {data.transactions.map((tx, index) => (
                <BlockTransactionRow key={tx.txid || index} tx={tx} index={index} />
              ))}
            </div>
          </div>
        )}
        </CardBody>
      </Card>
    );
  },
);
