'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { getApiUrl } from '@/lib/api-config';

const PERIODS = [
  { key: '30d', label: '30D' },
  { key: '90d', label: '90D' },
  { key: '6m', label: '6M' },
  { key: '1y', label: '1Y' },
  { key: 'all', label: 'ALL' },
];

const SORTS = [
  { key: 'held', label: 'Most stacked' },
  { key: 'holdRatio', label: 'Highest hold %' },
  { key: 'blocks', label: 'Most blocks' },
];

interface PoolRow {
  pool: string;
  earnedZat: string;
  spentZat: string;
  heldZat: string;
  blocks: number;
  activeDays: number;
  holdRatio: number;
  sellRatio: number;
}
interface Summary {
  totalEarnedZat: string;
  totalHeldZat: string;
  totalSpentZat: string;
  networkHoldRatio: number;
  poolCount: number;
}
interface ZodlData {
  period: string;
  pools: PoolRow[];
  summary: Summary | null;
  message?: string;
}

function zec(zat: string | number): number {
  return Number(BigInt(typeof zat === 'number' ? Math.round(zat) : zat)) / 1e8;
}

function fmtZec(zat: string): string {
  const z = zec(zat);
  if (Math.abs(z) >= 1000) return `${Math.round(z).toLocaleString()}`;
  return z.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function holdColor(ratio: number): string {
  if (ratio >= 0.25) return '#56D4C8';   // strong holder — cyan
  if (ratio >= 0.05) return '#F4B728';   // moderate — gold
  return '#6B7280';                       // mostly selling — muted
}

export function ZodlClient({
  initialData,
  initialPeriod,
}: {
  initialData: ZodlData | null;
  initialPeriod: string;
}) {
  const [period, setPeriod] = useState(initialPeriod);
  const [data, setData] = useState<ZodlData | null>(initialData);
  const [loading, setLoading] = useState(false);
  const [sortKey, setSortKey] = useState<'held' | 'holdRatio' | 'blocks'>('held');

  useEffect(() => {
    if (period === initialPeriod && initialData) return;
    let cancelled = false;
    setLoading(true);
    fetch(`${getApiUrl()}/api/mining/zodl-leaderboard?period=${period}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  const pools = useMemo(() => {
    const list = [...(data?.pools || [])];
    list.sort((a, b) => {
      if (sortKey === 'held') return Number(BigInt(b.heldZat) - BigInt(a.heldZat));
      if (sortKey === 'holdRatio') return b.holdRatio - a.holdRatio;
      return b.blocks - a.blocks;
    });
    return list;
  }, [data, sortKey]);

  const maxEarned = useMemo(
    () => pools.reduce((m, p) => Math.max(m, zec(p.earnedZat)), 1),
    [pools]
  );

  const summary = data?.summary;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs font-mono text-muted mb-4">
        <Link href="/" className="hover:text-primary transition-colors">Dashboard</Link>
        <span className="opacity-40">/</span>
        <Link href="/mining" className="hover:text-primary transition-colors">Mining</Link>
      </div>

      {/* Header */}
      <h1 className="text-2xl sm:text-3xl font-bold text-primary">Miner ZODL Leaderboard</h1>
      <p className="text-sm text-secondary mt-2 max-w-3xl leading-relaxed">
        Every block mints new ZEC for whoever mined it. Some pools cash out immediately; others sit on their rewards. This ranks pools by how much of what they earned they&apos;re still <span className="text-primary font-semibold">holding</span> — a read on who&apos;s betting on Zcash with their own stack.
      </p>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mt-5 mb-7">
        <div className="inline-flex gap-1 p-1 rounded-lg bg-glass-3">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`px-3 py-1 text-[11px] font-mono rounded-md transition-all ${
                period === p.key ? 'bg-cipher-yellow/15 text-cipher-yellow-bright font-bold' : 'text-muted hover:text-secondary'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="inline-flex gap-1 p-1 rounded-lg bg-glass-3">
          {SORTS.map((s) => (
            <button
              key={s.key}
              onClick={() => setSortKey(s.key as any)}
              className={`px-3 py-1 text-[11px] font-mono rounded-md transition-all ${
                sortKey === s.key ? 'bg-white/5 text-primary font-bold border border-white/10' : 'text-muted hover:text-secondary border border-transparent'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        {loading && <span className="text-[11px] font-mono text-cipher-cyan animate-pulse">updating…</span>}
      </div>

      {/* Summary */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-7">
          {[
            { label: 'Rewards mined', value: `${fmtZec(summary.totalEarnedZat)} ZEC`, color: 'text-primary' },
            { label: 'Still held', value: `${fmtZec(summary.totalHeldZat)} ZEC`, color: 'text-cipher-cyan' },
            { label: 'Network hold rate', value: `${(summary.networkHoldRatio * 100).toFixed(1)}%`, color: 'text-cipher-yellow-bright' },
            { label: 'Pools tracked', value: `${summary.poolCount}`, color: 'text-primary' },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-cipher-border bg-cipher-surface p-4">
              <div className={`text-xl font-bold font-mono ${s.color}`}>{s.value}</div>
              <div className="text-[10px] text-muted uppercase tracking-wider mt-1 font-mono">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Leaderboard */}
      {data?.message ? (
        <div className="rounded-xl border border-cipher-border bg-cipher-surface p-10 text-center">
          <p className="text-sm text-secondary">{data.message}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {/* column header */}
          <div className="hidden sm:flex items-center gap-3 px-4 text-[10px] font-mono text-muted uppercase tracking-wider">
            <div className="w-6">#</div>
            <div className="flex-1">Pool</div>
            <div className="w-24 text-right">Earned</div>
            <div className="w-[34%]">Held vs. sold</div>
          </div>

          {pools.map((p, i) => {
            const earnedBarPct = (zec(p.earnedZat) / maxEarned) * 100;
            const holdPct = Math.max(0, Math.min(100, p.holdRatio * 100));
            return (
              <div
                key={p.pool}
                className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 rounded-xl border border-cipher-border bg-cipher-surface px-4 py-3 hover:border-cipher-yellow/30 transition-colors"
              >
                <div className="flex items-center gap-3 sm:contents">
                  <div className={`w-6 text-sm font-mono font-bold ${i < 3 ? 'text-cipher-yellow-bright' : 'text-muted'}`}>
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-primary truncate">{p.pool}</div>
                    <div className="text-[10px] text-muted font-mono">{p.blocks.toLocaleString()} blocks · {p.activeDays}d active</div>
                  </div>
                </div>

                <div className="w-24 text-left sm:text-right">
                  <span className="text-sm font-mono text-secondary">{fmtZec(p.earnedZat)}</span>
                  <span className="text-[10px] text-muted ml-1">ZEC</span>
                </div>

                {/* held vs sold bar */}
                <div className="w-full sm:w-[34%]">
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1 h-3 rounded-full bg-glass-3 overflow-hidden">
                      <div
                        className="absolute inset-y-0 left-0 rounded-full"
                        style={{ width: `${holdPct}%`, backgroundColor: holdColor(p.holdRatio) }}
                        title={`Holding ${fmtZec(p.heldZat)} ZEC`}
                      />
                    </div>
                    <span className="text-xs font-mono font-bold tabular-nums w-12 text-right" style={{ color: holdColor(p.holdRatio) }}>
                      {holdPct.toFixed(1)}%
                    </span>
                  </div>
                  <div className="text-[10px] text-muted font-mono mt-0.5">
                    holds {fmtZec(p.heldZat)} · sold {fmtZec(p.spentZat)} ZEC
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Methodology */}
      <div className="mt-8 rounded-xl border border-cipher-border bg-cipher-surface p-5">
        <h3 className="text-xs font-mono font-bold text-secondary uppercase tracking-wider mb-2">How we read it</h3>
        <p className="text-xs text-muted leading-relaxed">
          We attribute each coinbase reward to a pool by its payout address, then track whether those coins are later spent. <span className="text-secondary">Held</span> is the share of mined ZEC still sitting in known payout addresses; <span className="text-secondary">sold</span> is what&apos;s moved on. It&apos;s a proxy, not gospel: a pool that rotates to a fresh address or shields its rewards reads as &ldquo;sold&rdquo; even if it still holds the coins economically. Treat it as a directional signal of accumulation, not an exact treasury balance.
        </p>
      </div>
    </div>
  );
}
