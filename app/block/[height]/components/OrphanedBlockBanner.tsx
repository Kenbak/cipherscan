import Link from 'next/link';
import { formatRelativeTime } from '@/lib/utils';
import { Badge } from '@/components/ui/Badge';
import { HashLink } from '@/components/ui/HashLink';
import type { BlockData } from './types';

export function OrphanedBlockBanner({ data }: { data: BlockData }) {
  if (!data.isOrphaned) return null;

  return (
    <div className="mb-6 space-y-4 animate-fade-in-up">
      <div className="rounded-xl border border-orange-500/30 bg-orange-950/30 backdrop-blur-sm p-4 sm:p-5">
        <div className="flex flex-col gap-3">
          <Badge color="orange" className="self-start text-[10px] font-bold tracking-wider">ORPHANED BLOCK</Badge>
          <p className="text-sm text-secondary">
            This block was replaced during a chain reorganization and is no longer part of the canonical chain.
          </p>
          <p className="text-xs text-muted font-mono">
            Transaction data is not available for orphaned blocks.
            {data.orphanSource && (
              <span className="ml-2 text-secondary">Source: {data.orphanSource}</span>
            )}
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-cipher-border bg-glass-2 backdrop-blur-sm p-4">
        <p className="text-[10px] font-mono uppercase tracking-wider text-muted mb-3">Reorg comparison at #{data.height.toLocaleString()}</p>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 rounded-lg border border-orange-500/30 bg-gradient-to-br from-orange-950/30 to-red-950/20 p-3">
            <span className="text-[10px] font-mono uppercase tracking-wider font-bold text-cipher-orange">Orphaned</span>
            <div className="mt-2 space-y-1.5">
              <HashLink value={data.hash} lead={10} tail={6} copy={false} linkClassName="text-xs font-mono text-cipher-orange block" />
              <div className="text-xs font-mono text-secondary">
                {data.minerPool ? (
                  data.minerPoolUrl ? (
                    <a href={data.minerPoolUrl} target="_blank" rel="noopener noreferrer" className="text-cipher-orange hover:underline">{data.minerPool}</a>
                  ) : (
                    <span className="text-cipher-orange">{data.minerPool}</span>
                  )
                ) : (
                  <span className="text-muted">Unknown miner</span>
                )}
              </div>
              <div className="flex gap-3 text-xs font-mono text-muted">
                <span>{data.transactionCount} txs</span>
                <span>{data.timestamp ? formatRelativeTime(data.timestamp) : '—'}</span>
              </div>
            </div>
          </div>

          <div className="hidden sm:flex items-center justify-center px-1">
            <span className="text-[10px] font-mono text-muted">vs</span>
          </div>

          {data.canonicalBlock ? (
            <div className="flex-1 rounded-lg border border-emerald-500/30 bg-gradient-to-br from-emerald-950/30 to-cyan-950/20 p-3">
              <span className="text-[10px] font-mono uppercase tracking-wider font-bold text-cipher-green">Canonical</span>
              <div className="mt-2 space-y-1.5">
                <HashLink
                  value={data.canonicalBlock.hash}
                  href={`/block/${data.canonicalBlock.height}`}
                  lead={10}
                  tail={6}
                  copy={false}
                  linkClassName="text-xs font-mono text-cipher-green hover:underline block"
                />
                <div className="text-xs font-mono text-secondary">
                  {data.canonicalBlock.minerPool ? (
                    data.canonicalBlock.minerPoolUrl ? (
                      <a href={data.canonicalBlock.minerPoolUrl} target="_blank" rel="noopener noreferrer" className="text-cipher-green hover:underline">{data.canonicalBlock.minerPool}</a>
                    ) : (
                      <span className="text-cipher-green">{data.canonicalBlock.minerPool}</span>
                    )
                  ) : (
                    <span className="text-muted">Unknown miner</span>
                  )}
                </div>
                <div className="flex gap-3 text-xs font-mono text-muted">
                  {data.canonicalBlock.transactionCount != null && (
                    <span>{data.canonicalBlock.transactionCount} txs</span>
                  )}
                  {data.canonicalBlock.timestamp && (
                    <span>{formatRelativeTime(data.canonicalBlock.timestamp)}</span>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 rounded-lg border border-cipher-border bg-glass-2 p-3 flex items-center justify-center">
              <span className="text-xs text-muted font-mono">Canonical block not indexed</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
