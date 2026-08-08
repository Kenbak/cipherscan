'use client';

import { useState } from 'react';
import { ShareableCard } from '@/components/ShareableCard';
import { fmtValue, type CurrencyMode } from '@/hooks/useCurrencyToggle';
import { InflowFlow, inflowPathDescription } from '../InflowFlow';
import { IronwoodLedgerStat } from './SupplyVerification';
import type { ChartColors, Overview } from './types';

export function InflowSources({
  sources,
  colors,
  currencyMode = 'zec',
  zecPrice = null,
}: {
  sources: NonNullable<Overview['inflowSources']>;
  colors: ChartColors;
  currencyMode?: CurrencyMode;
  zecPrice?: number | null;
}) {
  const rows = [
    { name: 'Orchard (ZIP-318)', zat: sources.fromOrchardZat, txs: sources.fromOrchardTxs, color: colors.orchardPool, group: 'shielded' as const },
    { name: 'Sapling', zat: sources.fromSaplingZat, txs: sources.fromSaplingTxs, color: colors.sapling, group: 'shielded' as const },
    { name: 'Transparent', zat: sources.fromTransparentZat, txs: sources.fromTransparentTxs, color: colors.transparent, group: 'transparent' as const },
    { name: 'Coinbase', zat: sources.fromCoinbaseZat, txs: sources.fromCoinbaseTxs, color: colors.coinbase, group: 'mining' as const },
  ].filter((r) => r.zat > 0 || r.txs > 0);

  if (rows.length === 0) return null;

  const totalIn = sources.totalInZat;
  const netZat = sources.totalInZat - sources.totalOutZat;
  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const fmt = (zat: number) => fmtValue(zat, currencyMode, zecPrice);
  const activeName = selected ?? hovered;

  const handleSelect = (name: string) => {
    setSelected((prev) => (prev === name ? null : name));
  };

  return (
    <div>
      <InflowFlow
        rows={rows}
        activeName={activeName}
        onHover={setHovered}
        onSelect={handleSelect}
        formatValue={fmt}
        ironwoodColor={colors.ironwoodPool}
        ironwoodZat={netZat}
      />

      <p className="mb-4 min-h-[1.125rem] text-[11px] font-mono text-secondary">
        {activeName ? (() => {
          const r = rows.find((x) => x.name === activeName);
          if (!r) return null;
          const pct = totalIn > 0 ? (r.zat / totalIn) * 100 : 0;
          const path = inflowPathDescription(r.name);
          return (
            <>
              <span style={{ color: r.color }}>{r.name}</span>
              {' · '}{path}
              {' · '}{fmt(r.zat)} · {r.txs.toLocaleString()} txs · {pct.toFixed(1)}%
              {selected === r.name ? (
                <span className="ml-2 text-[10px] text-muted/50">(pinned)</span>
              ) : null}
            </>
          );
        })() : (
          <span className="text-muted/45">Click a source to pin details · hover to preview</span>
        )}
      </p>

      <div className="grid grid-cols-1 gap-2 border-t border-cipher-border/20 pt-4 sm:grid-cols-3">
        <IronwoodLedgerStat
          icon={
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true" className="text-emerald-400/80">
              <path d="M1 5h6M5 2l3 3-3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          }
          label="Into Ironwood"
          hint="Indexed value entering the pool"
          value={fmt(totalIn)}
        />
        {sources.totalOutZat > 0 && (
          <>
            <IronwoodLedgerStat
              icon={
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true" className="text-muted/70">
                  <path d="M9 5H3M7 2 4 5l3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              }
              label="Out of Ironwood"
              hint="Indexed value leaving the pool"
              value={fmt(sources.totalOutZat)}
            />
            <IronwoodLedgerStat
              icon={
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true" style={{ color: colors.ironwoodPool }}>
                  <path d="M2 5h6M5 3v4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
              }
              label="Net in pool"
              hint="In minus out (matches pool balance)"
              value={fmt(netZat)}
              valueColor={colors.ironwoodPool}
            />
          </>
        )}
      </div>
    </div>
  );
}

export function IronwoodInflowCard({
  sources,
  pools,
  colors,
  currencyMode = 'zec',
  zecPrice = null,
}: {
  sources: NonNullable<Overview['inflowSources']>;
  pools: NonNullable<Overview['poolSizes']>;
  colors: ChartColors;
  currencyMode?: CurrencyMode;
  zecPrice?: number | null;
}) {
  const netZat = sources.totalInZat - sources.totalOutZat;
  const fmt = (zat: number) => fmtValue(zat, currencyMode, zecPrice);
  const shareText = `Ironwood pool inflows on Zcash: ${fmt(sources.totalInZat)} in, ${fmt(sources.totalOutZat)} out, ${fmt(netZat)} net.\n\nhttps://cipherscan.app/ironwood`;

  return (
    <ShareableCard
      title="Where Ironwood ZEC comes from"
      sourceHeight={pools.sourceHeight}
      isLive={pools.isLive}
      shareText={shareText}
      fileName="cipherscan-ironwood-inflows.png"
      watermark={false}
    >
      <InflowSources sources={sources} colors={colors} currencyMode={currencyMode} zecPrice={zecPrice} />
    </ShareableCard>
  );
}
