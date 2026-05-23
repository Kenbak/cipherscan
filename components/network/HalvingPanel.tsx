'use client';

import { Card, CardBody } from '@/components/ui/Card';
import { formatDuration, formatZecCompact } from '@/lib/format-numbers';

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
}

export function HalvingPanel({ halving }: { halving: HalvingInfo | null }) {
  if (!halving) return null;

  const progress = halving.eraProgress ?? (
    halving.blocksRemaining != null && halving.halvingBlock
      ? Math.max(0, Math.min(100, ((halving.halvingBlock - (halving.blocksRemaining ?? 0)) / halving.halvingBlock) * 100))
      : 0
  );

  return (
    <Card>
      <CardBody>
        <div className="flex items-center gap-2 mb-5">
          <span className="text-xs text-muted font-mono uppercase tracking-widest opacity-50">{'>'}</span>
          <h2 className="text-sm font-bold font-mono text-secondary uppercase tracking-wider">NEXT_HALVING</h2>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-5">
          <div>
            <p className="text-[10px] text-muted font-mono uppercase mb-1">Blocks remaining</p>
            <p className="text-2xl font-bold font-mono text-primary whitespace-nowrap">
              {halving.blocksRemaining?.toLocaleString() ?? '—'}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-muted font-mono uppercase mb-1">Estimated</p>
            <p className="text-lg font-bold font-mono text-primary">
              {halving.estimatedSeconds ? formatDuration(halving.estimatedSeconds) : '—'}
            </p>
            {halving.estimatedDate && (
              <p className="text-[10px] text-muted font-mono mt-0.5">
                {new Date(halving.estimatedDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
              </p>
            )}
          </div>
        </div>

        <div className="mb-5">
          <div className="flex justify-between text-[10px] text-muted font-mono mb-1.5">
            <span>Current era</span>
            <span>{progress.toFixed(1)}%</span>
          </div>
          <div className="h-2 bg-cipher-bg rounded-full overflow-hidden">
            <div
              className="h-full bg-cipher-yellow transition-all duration-700"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="bg-cipher-bg/50 rounded-lg p-3">
            <p className="text-[10px] text-muted font-mono uppercase mb-1">Current subsidy</p>
            <p className="font-mono font-bold text-cipher-yellow">{halving.currentSubsidy} ZEC</p>
            <p className="text-[10px] text-muted font-mono mt-0.5">Miner: {halving.minerReward} ZEC</p>
          </div>
          <div className="bg-cipher-bg/50 rounded-lg p-3">
            <p className="text-[10px] text-muted font-mono uppercase mb-1">Next subsidy</p>
            <p className="font-mono font-bold text-cipher-yellow">
              {halving.nextSubsidy != null ? `${halving.nextSubsidy} ZEC` : '—'}
            </p>
            {halving.nextMinerReward != null && (
              <p className="text-[10px] text-muted font-mono mt-0.5">Miner: {halving.nextMinerReward} ZEC</p>
            )}
          </div>
        </div>

        {halving.halvingBlock && (
          <p className="text-[10px] text-muted font-mono mt-4 text-center">
            Halving block {halving.halvingBlock.toLocaleString()}
          </p>
        )}
      </CardBody>
    </Card>
  );
}

export function SupplyEmissionPanel({
  circulating,
  remaining,
  circulatingPct,
  dailyEmission,
  maxSupply = 21_000_000,
}: {
  circulating: number;
  remaining: number;
  circulatingPct: number;
  dailyEmission: number | null;
  maxSupply?: number;
}) {
  return (
    <Card>
      <CardBody>
        <div className="flex items-center gap-2 mb-5">
          <span className="text-xs text-muted font-mono uppercase tracking-widest opacity-50">{'>'}</span>
          <h2 className="text-sm font-bold font-mono text-secondary uppercase tracking-wider">SUPPLY_EMISSION</h2>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <p className="text-[10px] text-muted font-mono uppercase mb-1">Circulating</p>
            <p className="text-xl font-bold font-mono text-cipher-yellow">{formatZecCompact(circulating)} ZEC</p>
            <p className="text-[10px] text-muted font-mono">{circulatingPct.toFixed(1)}% of {formatZecCompact(maxSupply)}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted font-mono uppercase mb-1">Remaining</p>
            <p className="text-xl font-bold font-mono text-secondary">{formatZecCompact(remaining)} ZEC</p>
            <p className="text-[10px] text-muted font-mono">
              ~{dailyEmission != null ? `${Math.round(dailyEmission).toLocaleString()} ZEC/day` : '—'}
            </p>
          </div>
        </div>

        <div className="h-2 bg-cipher-bg rounded-full overflow-hidden">
          <div
            className="h-full bg-cipher-yellow transition-all duration-700"
            style={{ width: `${Math.min(circulatingPct, 100)}%` }}
          />
        </div>
      </CardBody>
    </Card>
  );
}
