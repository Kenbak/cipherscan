'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

interface CrosslinkData {
  tipHeight: number;
  finalizedHeight: number;
  finalityGap: number;
  finalizerCount: number;
  totalStakeZec: number;
}

function StatCard({ label, value, sub, color }: {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center p-3 sm:p-4">
      <span className="text-[10px] font-mono text-muted uppercase tracking-wider mb-1">{label}</span>
      <span className={`text-lg sm:text-xl font-mono font-bold ${color || 'text-primary'}`}>
        {value}
      </span>
      {sub && <span className="text-[10px] font-mono text-muted mt-0.5">{sub}</span>}
    </div>
  );
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
        />
        <StatCard
          label="Finalized"
          value={stats.finalizedHeight.toLocaleString()}
          color="text-cipher-green"
        />
        <StatCard
          label="Finality Gap"
          value={stats.finalityGap.toLocaleString()}
          sub="blocks behind"
          color={stats.finalityGap > 100 ? 'text-cipher-orange' : 'text-primary'}
        />
        <Link href="/validators" className="hover:bg-[var(--color-hover)] transition-colors">
          <StatCard
            label="Finalizers"
            value={stats.finalizerCount}
            sub="view roster"
            color="text-cipher-purple"
          />
        </Link>
        <StatCard
          label="Total Stake"
          value={`${stats.totalStakeZec.toFixed(2)}`}
          sub="CTAZ"
        />
      </div>
    </div>
  );
}
