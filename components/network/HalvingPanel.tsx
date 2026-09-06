'use client';

import { Card, CardBody } from '@/components/ui/Card';
import { formatDuration } from '@/lib/format-numbers';

export interface HalvingInfo {
  halvingBlock: number | null;
  blocksRemaining: number | null;
  eraProgress?: number;
  currentSubsidy: number;
  nextSubsidy: number | null;
  minerReward: number;
  nextMinerReward: number | null;
  estimatedDate: string | null;
  estimatedSeconds: number | null;
  currentHeight?: number;
}

export function HalvingPanel({ halving }: { halving: HalvingInfo | null }) {
  if (!halving) return null;

  const progress = halving.eraProgress != null && Number.isFinite(halving.eraProgress)
    ? Math.max(0, Math.min(100, halving.eraProgress)) : null;

  const estDate = halving.estimatedDate
    ? new Date(halving.estimatedDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : null;

  return (
    <Card>
      <CardBody>
        <div className="flex items-center gap-2 mb-5">
          <span className="text-xs text-muted font-mono uppercase tracking-widest opacity-50">{'>'}</span>
          <h2 className="text-sm font-semibold font-mono text-secondary lowercase tracking-tight">NEXT_HALVING</h2>
        </div>

        <div className="text-center mb-5">
          <p className="text-3xl sm:text-4xl font-semibold font-mono text-primary tabular-nums">
            {halving.blocksRemaining?.toLocaleString() ?? '—'}
          </p>
          <p className="text-caption text-muted font-mono mt-1">blocks remaining</p>
        </div>

        {progress != null && <div className="mb-5">
          <div className="flex justify-between text-caption text-muted font-mono mb-1.5">
            <span>Current era progress</span>
            <span>{progress.toFixed(1)}%</span>
          </div>
          <div className="h-2.5 bg-cipher-bg rounded-full overflow-hidden">
            <div
              className="h-full bg-cipher-gold transition-[width] duration-700 rounded-full"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>}

        <div className="space-y-2.5">
          <div className="flex justify-between items-center">
            <span className="text-caption text-muted font-mono">Estimated time</span>
            <span className="text-caption font-mono text-primary font-medium">
              ~{halving.estimatedSeconds ? formatDuration(halving.estimatedSeconds) : '—'}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-caption text-muted font-mono">Estimated date</span>
            <span className="text-caption font-mono text-primary font-medium">{estDate ?? '—'}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-caption text-muted font-mono">Halving block</span>
            <span className="text-caption font-mono text-primary font-medium">
              {halving.halvingBlock?.toLocaleString() ?? '—'}
            </span>
          </div>
          <div className="border-t border-cipher-border my-2" />
          <div className="flex justify-between items-center">
            <span className="text-caption text-muted font-mono">Current block subsidy</span>
            <span className="text-caption font-mono text-cipher-yellow font-semibold">
              {halving.currentSubsidy} ZEC
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-caption text-muted font-mono">Next block subsidy</span>
            <span className="text-caption font-mono text-cipher-yellow font-semibold">
              {halving.nextSubsidy != null ? `${halving.nextSubsidy} ZEC` : '—'}
            </span>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
