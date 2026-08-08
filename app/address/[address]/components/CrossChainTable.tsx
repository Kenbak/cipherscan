'use client';

import Link from 'next/link';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { TokenChainIcon } from '@/components/TokenChainIcon';
import { Icons } from './icons';
import type { CrossChainActivity } from './types';

interface CrossChainTableProps {
  crossChain: CrossChainActivity;
}

export function CrossChainTable({ crossChain }: CrossChainTableProps) {
  return (
    <div className="animate-fade-in-up stagger-4">
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-muted tracking-wider">&gt; BRIDGES</span>
              <Badge color="cyan">{crossChain.totalSwaps}</Badge>
            </div>
            <span className="text-xs sm:text-sm text-muted font-normal font-mono sm:ml-auto">
              ${crossChain.totalVolumeUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })} vol · <span className="text-cipher-green">{crossChain.entryCount} in</span> · <span className="text-danger">{crossChain.exitCount} out</span>
            </span>
          </div>
        </CardHeader>
        <CardBody>
          <div className="overflow-x-auto -mx-6 px-6">
            {/* Table Header */}
            <div className="min-w-[800px] grid grid-cols-12 gap-3 px-4 py-2 mb-2 text-xs font-semibold text-muted uppercase tracking-wider border-b block-info-border">
              <div className="col-span-1">Type</div>
              <div className="col-span-3">From</div>
              <div className="col-span-1"></div>
              <div className="col-span-3">To</div>
              <div className="col-span-2 text-right">Value</div>
              <div className="col-span-2 text-right">ZEC TX</div>
            </div>

            {/* Swap Rows */}
            <div className="max-h-[600px] overflow-y-auto space-y-2 min-w-[800px]">
              {crossChain.swaps.map((swap) => {
                const swapAge = (() => {
                  const diffMs = Date.now() - swap.timestamp;
                  const diffDays = Math.floor(diffMs / 86400000);
                  const diffHours = Math.floor(diffMs / 3600000);
                  const diffMins = Math.floor(diffMs / 60000);
                  if (diffDays > 0) return `${diffDays}d ago`;
                  if (diffHours > 0) return `${diffHours}h ago`;
                  if (diffMins > 0) return `${diffMins}m ago`;
                  return 'now';
                })();
                const fromChain = swap.direction === 'inflow' ? swap.sourceChain : 'zec';
                const toChain = swap.direction === 'inflow' ? 'zec' : swap.destChain;

                return (
                  <div key={swap.id} className="grid grid-cols-12 gap-3 items-center block-tx-row p-3 rounded-lg border border-cipher-border hover:border-cipher-cyan transition-all group">
                    {/* Direction */}
                    <div className="col-span-1">
                      {swap.direction === 'inflow' ? (
                        <Badge color="green" icon={<Icons.ArrowDown />}>IN</Badge>
                      ) : (
                        <Badge color="orange" icon={<Icons.ArrowUp />}>OUT</Badge>
                      )}
                    </div>

                    {/* From */}
                    <div className="col-span-3 flex items-center gap-2 min-w-0">
                      <TokenChainIcon token={swap.sourceToken} chain={fromChain} size={24} />
                      <span className="text-xs font-mono text-primary truncate">
                        {swap.sourceAmount.toLocaleString(undefined, { maximumFractionDigits: 4 })} {swap.sourceToken}
                      </span>
                    </div>

                    {/* Arrow */}
                    <div className="col-span-1 text-center">
                      <span className="text-muted text-xs">→</span>
                    </div>

                    {/* To */}
                    <div className="col-span-3 flex items-center gap-2 min-w-0">
                      <TokenChainIcon token={swap.destToken} chain={toChain} size={24} />
                      <span className="text-xs font-mono text-primary truncate">
                        {swap.destAmount.toLocaleString(undefined, { maximumFractionDigits: 4 })} {swap.destToken}
                      </span>
                    </div>

                    {/* Value + Age */}
                    <div className="col-span-2 text-right">
                      <span className="text-xs text-muted font-mono block">${swap.sourceAmountUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                      <span className="text-[10px] text-muted">{swapAge}</span>
                    </div>

                    {/* ZEC TX */}
                    <div className="col-span-2 text-right">
                      {swap.zecTxid ? (
                        <Link href={`/tx/${swap.zecTxid}`} className="text-xs text-cipher-cyan hover:underline font-mono group-hover:text-cipher-cyan transition-colors">
                          {swap.zecTxid.slice(0, 8)}...
                        </Link>
                      ) : (
                        <span className="text-xs text-muted font-mono">--</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
