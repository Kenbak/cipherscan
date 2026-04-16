'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Tooltip } from '@/components/Tooltip';

interface CrosslinkData {
  tipHeight: number;
  finalizedHeight: number;
  finalityGap: number;
  finalizerCount: number;
  totalStakeZec: number;
}

const STAT_TOOLTIPS: Record<string, string> = {
  'PoW Tip': 'Latest block mined by Proof-of-Work miners. This is the chain tip before finalization.',
  'Finalized': 'Highest block confirmed by the BFT finality gadget. Finalized blocks can never be reversed.',
  'Finality Gap': 'Blocks between the PoW tip and the last finalized block. A smaller gap means faster finalization.',
  'Finalizers': 'Validator nodes that vote on blocks using BFT consensus. More finalizers = stronger security.',
  'Total Stake': 'Total cTAZ locked in delegation bonds across all finalizers. Stake determines voting power.',
};

function StatCard({ label, value, sub, color, tooltip }: {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
  tooltip?: string;
}) {
  const inner = (
    <div className="flex flex-col items-center justify-center p-3 sm:p-4">
      <span className="text-[10px] font-mono text-muted uppercase tracking-wider mb-1 flex items-center gap-1">
        {label}
        {tooltip && (
          <svg className="w-3 h-3 text-muted/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )}
      </span>
      <span className={`text-lg sm:text-xl font-mono font-bold ${color || 'text-primary'}`}>
        {value}
      </span>
      {sub && <span className="text-[10px] font-mono text-muted mt-0.5">{sub}</span>}
    </div>
  );

  if (tooltip) {
    return <Tooltip content={tooltip}>{inner}</Tooltip>;
  }
  return inner;
}

export function CrosslinkStats() {
  const [stats, setStats] = useState<CrosslinkData | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/crosslink');
      if (!res.ok) return;
      const data = await res.json();
      if (data.success) {
        setStats({
          tipHeight: data.tipHeight,
          finalizedHeight: data.finalizedHeight,
          finalityGap: data.finalityGap,
          finalizerCount: data.finalizerCount,
          totalStakeZec: data.totalStakeZec,
        });
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 15000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  if (!stats) {
    return (
      <div className="card p-0 overflow-hidden">
        <div className="grid grid-cols-2 sm:grid-cols-5 divide-x divide-y sm:divide-y-0 divide-cipher-border">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex flex-col items-center justify-center p-4 animate-pulse">
              <div className="h-3 w-12 skeleton-bg rounded mb-2" />
              <div className="h-6 w-16 skeleton-bg rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="card p-0 overflow-hidden">
      <div className="grid grid-cols-2 sm:grid-cols-5 divide-x divide-y sm:divide-y-0 divide-cipher-border">
        <StatCard
          label="PoW Tip"
          value={stats.tipHeight.toLocaleString()}
          color="text-cipher-cyan"
          tooltip={STAT_TOOLTIPS['PoW Tip']}
        />
        <StatCard
          label="Finalized"
          value={stats.finalizedHeight.toLocaleString()}
          color="text-cipher-green"
          tooltip={STAT_TOOLTIPS['Finalized']}
        />
        <StatCard
          label="Finality Gap"
          value={stats.finalityGap.toLocaleString()}
          sub="blocks behind"
          color={stats.finalityGap > 100 ? 'text-cipher-orange' : 'text-primary'}
          tooltip={STAT_TOOLTIPS['Finality Gap']}
        />
        <Link href="/validators" className="hover:bg-[var(--color-hover)] transition-colors">
          <StatCard
            label="Finalizers"
            value={stats.finalizerCount}
            sub="view roster"
            color="text-cipher-purple"
            tooltip={STAT_TOOLTIPS['Finalizers']}
          />
        </Link>
        <StatCard
          label="Total Stake"
          value={`${stats.totalStakeZec.toFixed(2)}`}
          sub="CTAZ"
          tooltip={STAT_TOOLTIPS['Total Stake']}
        />
      </div>
    </div>
  );
}
