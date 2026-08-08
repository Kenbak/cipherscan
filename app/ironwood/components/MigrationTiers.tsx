'use client';

import { useEffect, useMemo, useState } from 'react';
import { ShareableCard } from '@/components/ShareableCard';
import { getApiUrl } from '@/lib/api-config';
import { fmtValue, type CurrencyMode } from '@/hooks/useCurrencyToggle';
import { zatToZec } from '@/lib/format-numbers';
import type { ChartColors, TierTx } from './types';

export const TIER_BOUNDARIES_ZAT = [1e8, 10e8, 100e8, 1000e8];
export const TIER_LABELS = ['Under 1', '1–10', '10–100', '100–1K', '1K+'];
export const TIER_COLORS = ['#94a3b8', '#60a5fa', '#a78bfa', '#f59e0b', '#ef4444'];

export function formatTierVolumePct(pct: number): string {
  if (pct < 0.1 && pct > 0) return `${pct.toFixed(2)}%`;
  if (pct < 1 && pct > 0) return `${pct.toFixed(1)}%`;
  return `${Math.round(pct)}%`;
}

export function classifyTierLocal(zat: number): number {
  for (let i = 0; i < TIER_BOUNDARIES_ZAT.length; i++) {
    if (zat < TIER_BOUNDARIES_ZAT[i]) return i;
  }
  return TIER_BOUNDARIES_ZAT.length;
}

export function MigrationTiers({
  activated,
  colors,
  tipHeight,
  currencyMode = 'zec',
  zecPrice = null,
}: {
  activated: boolean;
  colors: ChartColors;
  tipHeight: number;
  currencyMode?: CurrencyMode;
  zecPrice?: number | null;
}) {
  const [allTxs, setAllTxs] = useState<TierTx[]>([]);
  const [mode, setMode] = useState<'live' | 'scrub'>('live');
  const [scrubIdx, setScrubIdx] = useState(1000);
  useEffect(() => {
    if (!activated) return;
    const url = `${getApiUrl()}/api/migration/tiers`;
    fetch(url).then(r => r.json()).then(d => {
      if (d.success && d.txs) setAllTxs(d.txs);
    }).catch(() => {});
  }, [activated]);

  const maxIdx = allTxs.length;
  const visibleTxs = useMemo(() => {
    if (mode === 'live' || scrubIdx >= maxIdx) return allTxs;
    return allTxs.slice(0, scrubIdx);
  }, [allTxs, mode, scrubIdx, maxIdx]);

  const tierData = useMemo(() => {
    const counts = new Array(5).fill(0);
    const volumes = new Array(5).fill(0);
    for (const tx of visibleTxs) {
      const tier = classifyTierLocal(tx.a);
      counts[tier]++;
      volumes[tier] += tx.a;
    }
    const totalVol = volumes.reduce((s: number, v: number) => s + v, 0);
    return TIER_LABELS.map((label, i) => ({
      label,
      count: counts[i],
      volumeZat: volumes[i],
      volumeZec: zatToZec(volumes[i]),
      volumePct: totalVol > 0 ? (volumes[i] / totalVol) * 100 : 0,
      fill: TIER_COLORS[i],
    }));
  }, [visibleTxs]);

  const totalTxs = visibleTxs.length;
  const totalVolZat = tierData.reduce((s, t) => s + t.volumeZat, 0);
  const maxVol = Math.max(...tierData.map(t => t.volumeZec));
  const scrubDate = useMemo(() => {
    if (mode === 'live' || !visibleTxs.length) return null;
    const last = visibleTxs[visibleTxs.length - 1];
    return last?.t ? new Date(last.t * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' }) + ' UTC' : null;
  }, [mode, visibleTxs]);

  if (!activated) return null;
  if (!allTxs.length) return null;

  return (
    <div id="migration-tiers" className="scroll-mt-20">
      <ShareableCard
        title="Who's migrating?"
        sourceHeight={tipHeight}
        isLive={activated}
        shareText={`Ironwood migration by size: ${tierData.map(t => `${t.label} ZEC: ${t.count} txs (${t.volumePct.toFixed(0)}% vol)`).join(' · ')}\n\nhttps://cipherscan.app/ironwood`}
        fileName="cipherscan-migration-tiers.png"
      >
        <p className="text-xs text-muted mb-5">
          Orchard → Ironwood migration volume by transaction size. Drag the scrubber to see how the distribution evolved.
        </p>

        <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 mb-4 text-[10px] font-mono text-muted">
          <span><span className="text-primary font-bold text-sm">{totalTxs.toLocaleString()}</span> transactions</span>
          <span><span className="text-primary font-bold text-sm">{fmtValue(totalVolZat, currencyMode, zecPrice)}</span> total</span>
        </div>

        {/* Mobile — horizontal breakdown (iOS Storage-style) */}
        <div className="flex flex-col gap-3.5 sm:hidden">
          {tierData.map((tier, i) => (
              <div key={tier.label}>
                <div className="mb-1.5 flex items-baseline justify-between gap-3">
                  <div className="min-w-0">
                    <span className="text-xs font-mono font-semibold text-primary">{tier.label}</span>
                    <span className="ml-2 text-[10px] font-mono text-muted">{tier.count.toLocaleString()} txs</span>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className="text-xs font-mono font-bold tabular-nums text-primary">
                      {fmtValue(tier.volumeZat, currencyMode, zecPrice)}
                    </span>
                    <span className="ml-1.5 text-[10px] font-mono text-muted">{formatTierVolumePct(tier.volumePct)}</span>
                  </div>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-glass-3">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.max(tier.volumePct, tier.count > 0 ? 1 : 0)}%`,
                      backgroundColor: TIER_COLORS[i],
                      opacity: tier.count > 0 ? 0.9 : 0.25,
                    }}
                  />
                </div>
              </div>
          ))}
        </div>

        {/* Desktop — vertical column chart */}
        <div className="hidden sm:grid sm:grid-cols-5 sm:gap-3">
          {tierData.map((tier, i) => {
            const barPct = maxVol > 0 ? (tier.volumeZec / maxVol) * 100 : 0;
            return (
              <div key={tier.label} className="flex flex-col items-center">
                <div className="mb-1 text-xs font-mono font-bold text-primary">
                  {fmtValue(tier.volumeZat, currencyMode, zecPrice)}
                </div>
                <div className="mb-2 text-[9px] font-mono text-muted">{formatTierVolumePct(tier.volumePct)}</div>
                <div className="relative flex h-[140px] w-full justify-center">
                  <div className="relative h-full w-10 overflow-hidden rounded-t-md bg-glass-3">
                    <div
                      className="absolute bottom-0 left-0 right-0 rounded-t-md transition-all duration-500"
                      style={{ height: `${Math.max(barPct, 2)}%`, backgroundColor: TIER_COLORS[i], opacity: 0.85 }}
                    />
                  </div>
                </div>
                <div className="mt-2 text-center text-[10px] font-mono text-muted">{tier.label}</div>
                <div className="text-[10px] font-mono text-muted/60">{tier.count} txs</div>
              </div>
            );
          })}
        </div>

        <div className="mb-4 mt-3 hidden text-center text-[10px] font-mono text-muted sm:block">
          Orchard → Ironwood volume by migration size · {totalTxs.toLocaleString()} total txs
        </div>

        {/* Scrubber */}
        <div className="mt-4 rounded-xl border sm:mt-2 border-cipher-border/25 bg-glass-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="relative min-w-0 flex-1">
              <div className="group relative py-2">
                <div className="relative h-2 rounded-full ring-1 ring-inset bg-glass-6 ring-cipher-border/30">
                  <div
                    className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-cipher-yellow/35 to-cipher-yellow/55 transition-[width] duration-100"
                    style={{ width: `${mode === 'live' ? 100 : (scrubIdx / Math.max(maxIdx, 1)) * 100}%` }}
                  />
                  <div
                    className="pointer-events-none absolute top-1/2 z-[2] h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-cipher-yellow/80 bg-cipher-yellow shadow-sm"
                    style={{ left: `${mode === 'live' ? 100 : (scrubIdx / Math.max(maxIdx, 1)) * 100}%` }}
                  />
                  <input
                    type="range"
                    min={1}
                    max={maxIdx}
                    value={mode === 'live' ? maxIdx : scrubIdx}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10);
                      setMode('scrub');
                      setScrubIdx(v);
                    }}
                    className="absolute inset-0 z-[3] h-full w-full cursor-grab opacity-0 active:cursor-grabbing"
                    aria-label="Migration timeline scrubber"
                  />
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => { setMode('live'); setScrubIdx(maxIdx); }}
              className="shrink-0 rounded-full border border-cipher-border/50 px-2.5 py-0.5 text-[10px] font-mono uppercase tracking-wider text-muted hover:border-cipher-border transition-all"
            >
              <span className={`mr-1 inline-block h-1.5 w-1.5 rounded-full ${mode === 'live' ? 'bg-emerald-400 animate-pulse' : 'bg-current opacity-30'}`} />
              Live
            </button>
          </div>
          <div className="flex items-center justify-between text-[10px] font-mono text-muted mt-1">
            <span>Block {allTxs[0]?.h?.toLocaleString() ?? '—'}</span>
            <span>{mode === 'live' ? `${totalTxs} migrations` : scrubDate ?? `${visibleTxs.length} migrations`}</span>
          </div>
        </div>
      </ShareableCard>
    </div>
  );
}
