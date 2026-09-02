'use client';

import { useMemo } from 'react';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { TokenChainIcon } from '@/components/TokenChainIcon';

export interface TokenVolume {
  symbol: string;
  volume24h: number;
}

export interface ChainGroup {
  chain: string;
  chainName: string;
  color: string;
  totalVolume24h: number;
  tokens: TokenVolume[];
}

interface ChainFlowRow {
  chain: string;
  chainName: string;
  inflow: number;
  inflowTokens: TokenVolume[];
  outflow: number;
  outflowTokens: TokenVolume[];
  net: number;
}

function formatUSD(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(2)}`;
}

function TokenBreakdown({ chain, tokens }: { chain: string; tokens: TokenVolume[] }) {
  if (tokens.length === 0) return null;
  const sorted = [...tokens].sort((a, b) => b.volume24h - a.volume24h);
  return (
    <div className="flex items-center gap-1 mt-1">
      {sorted.slice(0, 4).map((t) => (
        <span key={t.symbol} className="inline-flex items-center gap-0.5" title={`${t.symbol}: ${formatUSD(t.volume24h)}`}>
          <TokenChainIcon token={t.symbol} chain={chain} size={13} />
        </span>
      ))}
      {sorted.length > 4 && <span className="text-[9px] text-muted">+{sorted.length - 4}</span>}
      {sorted.length === 1 && <span className="text-[9px] text-muted font-mono">{sorted[0].symbol}</span>}
    </div>
  );
}

export function ChainFlowTable({ inflows, outflows }: { inflows: ChainGroup[]; outflows: ChainGroup[] }) {
  const rows: ChainFlowRow[] = useMemo(() => {
    const byChain: Record<string, ChainFlowRow> = {};

    for (const g of inflows) {
      byChain[g.chain] ??= { chain: g.chain, chainName: g.chainName, inflow: 0, inflowTokens: [], outflow: 0, outflowTokens: [], net: 0 };
      byChain[g.chain].inflow = g.totalVolume24h;
      byChain[g.chain].inflowTokens = g.tokens;
    }
    for (const g of outflows) {
      byChain[g.chain] ??= { chain: g.chain, chainName: g.chainName, inflow: 0, inflowTokens: [], outflow: 0, outflowTokens: [], net: 0 };
      byChain[g.chain].outflow = g.totalVolume24h;
      byChain[g.chain].outflowTokens = g.tokens;
    }

    return Object.values(byChain)
      .map((r) => ({ ...r, net: r.inflow - r.outflow }))
      .sort((a, b) => (b.inflow + b.outflow) - (a.inflow + a.outflow));
  }, [inflows, outflows]);

  const columns: DataTableColumn<ChainFlowRow>[] = [
    {
      id: 'chain',
      header: 'Chain',
      cell: (r) => (
        <div className="flex items-center gap-2.5">
          <TokenChainIcon token={r.chain} chain={r.chain} size={26} />
          <span className="text-sm font-mono font-semibold text-primary">{r.chainName}</span>
        </div>
      ),
      skeletonWidth: 'w-24',
    },
    {
      id: 'inflow',
      header: 'Inflow (24h)',
      align: 'right',
      cell: (r) => r.inflow > 0 ? (
        <div className="flex flex-col items-end">
          <span className="text-sm font-mono text-cipher-green font-semibold">{formatUSD(r.inflow)}</span>
          <TokenBreakdown chain={r.chain} tokens={r.inflowTokens} />
        </div>
      ) : <span className="text-muted">—</span>,
      skeletonWidth: 'w-16',
    },
    {
      id: 'outflow',
      header: 'Outflow (24h)',
      align: 'right',
      cell: (r) => r.outflow > 0 ? (
        <div className="flex flex-col items-end">
          <span className="text-sm font-mono text-danger font-semibold">{formatUSD(r.outflow)}</span>
          <TokenBreakdown chain={r.chain} tokens={r.outflowTokens} />
        </div>
      ) : <span className="text-muted">—</span>,
      skeletonWidth: 'w-16',
    },
    {
      id: 'net',
      header: 'Net',
      align: 'right',
      cell: (r) => (
        <span className={`text-sm font-mono font-bold ${r.net >= 0 ? 'text-cipher-green' : 'text-danger'}`}>
          {r.net >= 0 ? '+' : ''}{formatUSD(r.net)}
        </span>
      ),
      skeletonWidth: 'w-16',
    },
  ];

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs text-muted font-mono uppercase tracking-widest opacity-50">{'>'}</span>
        <h2 className="text-sm font-bold font-mono text-secondary uppercase tracking-wider">FLOW_BY_CHAIN</h2>
        <span className="text-[10px] text-muted ml-auto">24h · per-chain, per-token</span>
      </div>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.chain}
        empty={<div className="text-center py-8"><p className="text-muted text-sm font-mono">No cross-chain activity in the last 24h</p></div>}
      />
    </div>
  );
}
