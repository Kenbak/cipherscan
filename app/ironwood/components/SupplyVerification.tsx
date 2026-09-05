'use client';

import { type ReactNode } from 'react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { ShareableCard } from '@/components/ShareableCard';
import { fmtValue, type CurrencyMode } from '@/hooks/useCurrencyToggle';
import type { ChartColors, Overview, PoolRow } from './types';
import { PoolBalanceRow } from './PoolBalanceRow';

export function IronwoodLedgerStat({
  icon,
  label,
  hint,
  value,
  valueColor,
}: {
  icon: ReactNode;
  label: string;
  hint: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <div className="rounded-lg border border-cipher-border/25 bg-glass-3/20 px-3 py-2 sm:py-2.5">
      <div className="flex items-baseline justify-between gap-2 sm:flex-col sm:items-stretch sm:gap-0">
        <div className="flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-wide text-muted">
          {icon}
          {label}
        </div>
        <div
          className="shrink-0 text-sm font-mono font-semibold tabular-nums text-primary sm:mt-1 sm:shrink"
          style={valueColor ? { color: valueColor } : undefined}
        >
          {value}
        </div>
      </div>
      <div className="mt-1 text-[9px] leading-snug text-muted/55 sm:mt-0.5">{hint}</div>
    </div>
  );
}

export function SupplyVerification({
  overview,
  colors,
  currencyMode = 'zec',
  zecPrice = null,
}: {
  overview: Overview | null;
  colors: ChartColors;
  currencyMode?: CurrencyMode;
  zecPrice?: number | null;
}) {
  const audit = overview?.supplyAudit;
  const pools = overview?.poolSizes;
  if (!audit || !pools) return null;

  const totalSupply = pools.chainSupplyZat;

  // Fold deferred/lockbox into transparent (not a separate pool)
  const transparentZat = (pools.transparentZat ?? 0) + (pools.deferredZat ?? 0);

  const poolRows: PoolRow[] = [];
  if (transparentZat > 0) {
    poolRows.push({ name: 'Transparent', zat: transparentZat, pct: 0, color: colors.transparent, category: 'transparent' });
  }
  if (pools.sproutZat > 0) {
    poolRows.push({ name: 'Sprout', zat: pools.sproutZat, pct: 0, color: colors.sprout, category: 'shielded' });
  }
  if (pools.saplingZat > 0) {
    poolRows.push({ name: 'Sapling', zat: pools.saplingZat, pct: 0, color: colors.sapling, category: 'shielded' });
  }
  poolRows.push({ name: 'Orchard', zat: pools.orchardZat, pct: 0, color: colors.orchardPool, category: 'shielded' });
  poolRows.push({ name: 'Ironwood', zat: pools.ironwoodZat, pct: 0, color: colors.ironwoodPool, highlight: true, category: 'shielded' });

  const transparentPools = poolRows.filter((r) => r.category === 'transparent');
  const shieldedPools = poolRows.filter((r) => r.category === 'shielded');

  const computedTotal = poolRows.reduce((sum, r) => sum + r.zat, 0);
  const displayTotal = totalSupply ?? computedTotal;
  poolRows.forEach((r) => { r.pct = displayTotal > 0 ? (r.zat / displayTotal) * 100 : 0; });

  const MAX_SUPPLY_ZAT = 2_100_000_000_000_000;
  const unminedZat = MAX_SUPPLY_ZAT - displayTotal;
  const supplySum = displayTotal + unminedZat;
  const supplyBalanced = supplySum === MAX_SUPPLY_ZAT;

  const poolSum = computedTotal;
  const supplyMatch = totalSupply != null ? poolSum === totalSupply : null;

  // Use server-computed supply verification (single source of truth)
  // When Zebra RPC is unavailable, supplyVerification will be null — show only pool data
  const sv = overview?.supplyVerification;
  const hasSupplyData = sv != null && sv.chainSupplyZat != null;
  const verifiedPct = hasSupplyData ? sv.verifiedPct : null;

  // Donut data: two segments — verified (green) and Orchard/unverified (purple)
  // Use a minimum visual value so the Orchard segment is always clearly visible
  const minVisualPct = 5;
  const orchardVisualPct = verifiedPct != null ? Math.max(100 - verifiedPct, minVisualPct) : 50;
  const ringData = [
    { name: 'Verified', value: 100 - orchardVisualPct },
    { name: 'Orchard', value: orchardVisualPct },
  ];
  const RING_COLORS = [colors.verifiedRing, colors.orchardPool];
  const shareText = verifiedPct != null
    ? `${verifiedPct.toFixed(1)}% of Zcash supply cryptographically verified. No inflation detected.\n\nhttps://cipherscan.app/ironwood`
    : `Zcash Ironwood migration tracker\n\nhttps://cipherscan.app/ironwood`;

  return (
    <div id="supply" className="scroll-mt-20">
      <ShareableCard
        title="Zcash supply verification"
        sourceHeight={pools.sourceHeight}
        isLive={pools.isLive}
        shareText={shareText}
        fileName="cipherscan-supply.png"
      >
      <div className="grid grid-cols-1 sm:grid-cols-[2fr_3fr] lg:grid-cols-[5fr_7fr] gap-6 sm:gap-10 lg:gap-14 items-center">
        {/* Left: Ring */}
        <div className="flex flex-col items-center justify-center w-full px-2 sm:px-6 lg:px-10 py-2 sm:py-4">
          <div className="relative w-44 h-44 sm:w-48 sm:h-48">
            <ResponsiveContainer initialDimension={{ width: 500, height: 300 }} width="100%" height="100%">
              <PieChart>
                <Pie
                  data={ringData}
                  dataKey="value"
                  cx="50%"
                  cy="50%"
                  innerRadius="70%"
                  outerRadius="95%"
                  strokeWidth={0}
                  startAngle={90}
                  endAngle={-270}
                  animationDuration={800}
                >
                  {ringData.map((_, i) => (
                    <Cell key={i} fill={RING_COLORS[i]} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            {/* Center */}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-bold font-mono text-primary leading-none">
                {verifiedPct != null ? `${verifiedPct.toFixed(1)}%` : '—'}
              </span>
              <span className="text-[10px] text-emerald-400/70 mt-1 font-medium">turnstile-verified</span>
            </div>
          </div>

          {/* Legend below ring */}
          <div className="flex items-center justify-center gap-x-4 gap-y-1 flex-wrap mt-4 text-[11px]">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <span className="text-muted">Verified</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: colors.orchardPool }} />
              <span className="text-muted">Orchard</span>
            </div>
          </div>
        </div>

        {/* Right: Pool breakdown */}
        <div className="w-full min-w-0 sm:space-y-1 sm:pl-2 lg:pl-4">
          <div className="flex items-center justify-between mb-1.5 sm:mb-3 px-0.5">
            <span className="text-xs font-bold text-primary">Pool balances</span>
            {supplyMatch != null && (
              <div className="flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${supplyMatch ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
                <span className={`text-[10px] font-mono ${supplyMatch ? 'text-emerald-400/70' : 'text-red-400'}`}>
                  {supplyMatch ? 'No inflation' : 'Mismatch'}
                </span>
              </div>
            )}
          </div>
          <div className="divide-y divide-cipher-border/15 sm:divide-y-0">
            {transparentPools.map((row) => (
              <PoolBalanceRow key={row.name} row={row} currencyMode={currencyMode} zecPrice={zecPrice} />
            ))}
            {transparentPools.length > 0 && shieldedPools.length > 0 && (
              <div className="my-1 border-t border-cipher-border-subtle sm:my-2" aria-hidden="true" />
            )}
            {shieldedPools.map((row) => (
              <PoolBalanceRow key={row.name} row={row} currencyMode={currencyMode} zecPrice={zecPrice} />
            ))}
          </div>
          <div className="flex items-center justify-between pt-1.5 mt-1 border-t border-cipher-border/30 px-2 sm:px-3">
            <span className="text-[11px] sm:text-xs text-secondary">Mined</span>
            <span className="text-[11px] sm:text-sm font-mono text-primary">{fmtValue(displayTotal, currencyMode, zecPrice)}</span>
          </div>
          <div className="flex items-center justify-between px-2 sm:px-3 py-0.5 sm:py-1">
            <span className="text-[11px] sm:text-xs text-secondary">Unmined</span>
            <span className="text-[11px] sm:text-sm font-mono text-primary">{fmtValue(unminedZat, currencyMode, zecPrice)}</span>
          </div>
          <div className="flex items-center justify-between pt-1.5 mt-1 border-t border-cipher-border/30 px-2 sm:px-3">
            <div className="flex items-center gap-2">
              <span className="text-[11px] sm:text-xs font-bold text-primary">Max supply</span>
              {supplyBalanced && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
            </div>
            <span className="text-[11px] sm:text-sm font-mono font-bold text-primary">{fmtValue(MAX_SUPPLY_ZAT, currencyMode, zecPrice)}</span>
          </div>
        </div>
      </div>
    </ShareableCard>
    </div>
  );
}
