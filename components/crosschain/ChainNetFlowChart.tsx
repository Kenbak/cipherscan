'use client';

import { useMemo, useState } from 'react';
import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { useTheme } from '@/contexts/ThemeContext';
import { getChartColors } from '@/lib/chart-theme';
import { useApiQuery } from '@/hooks/useApiQuery';
import { ChartCard } from '@/components/network/ChartCard';
import { PeriodPillTags } from '@/components/ui/PeriodPillTags';

type Period = '7d' | '30d';

interface VolumeByChainRow {
  chain: string;
  direction: 'inflow' | 'outflow';
  volumeUsd: number;
}

interface VolumeByChainResponse {
  success: boolean;
  chains: VolumeByChainRow[];
}

interface ChainNetRow {
  chain: string;
  chainName: string;
  inflow: number;
  outflow: number;
  net: number;
}

const PERIOD_OPTIONS: { key: Period; label: string }[] = [
  { key: '7d', label: '7D' },
  { key: '30d', label: '30D' },
];

const CHAIN_NAMES: Record<string, string> = {
  btc: 'Bitcoin', eth: 'Ethereum', sol: 'Solana', near: 'NEAR', usdc: 'USDC', usdt: 'Tether',
  doge: 'Dogecoin', xrp: 'Ripple', base: 'Base', arb: 'Arbitrum', pol: 'Polygon', avax: 'Avalanche',
  trx: 'Tron', apt: 'Aptos', sui: 'Sui', ton: 'TON', bnb: 'BNB Chain', op: 'Optimism', ltc: 'Litecoin',
};

function formatUSD(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

function NetFlowTooltip({ active, payload, colors }: {
  active?: boolean;
  payload?: Array<{ payload?: ChainNetRow }>;
  colors: ReturnType<typeof getChartColors>;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;

  return (
    <div
      className="rounded-lg border px-3 py-2 text-xs font-mono shadow-lg"
      style={{ backgroundColor: colors.tooltipBg, borderColor: colors.tooltipBorder, color: colors.tooltipText }}
    >
      <p className="mb-2 text-[10px] uppercase tracking-wider text-muted">{row.chainName}</p>
      <p className="tabular-nums text-secondary"><span className="text-cipher-green">Inflow</span>: {formatUSD(row.inflow)}</p>
      <p className="tabular-nums text-secondary"><span className="text-danger">Outflow</span>: {formatUSD(row.outflow)}</p>
      <p className="tabular-nums text-primary mt-1 pt-1 border-t" style={{ borderColor: colors.tooltipBorder }}>
        Net: <span className={row.net >= 0 ? 'text-cipher-green' : 'text-danger'}>{row.net >= 0 ? '+' : ''}{formatUSD(row.net)}</span>
      </p>
    </div>
  );
}

export function ChainNetFlowChart() {
  const { theme } = useTheme();
  const colors = getChartColors(theme);
  const [period, setPeriod] = useState<Period>('30d');

  const { data, loading } = useApiQuery<VolumeByChainResponse>('/api/crosschain/volume-by-chain', { period });

  const rows: ChainNetRow[] = useMemo(() => {
    const byChain: Record<string, ChainNetRow> = {};
    for (const r of data?.chains ?? []) {
      const key = (r.chain || 'unknown').toLowerCase();
      if (key === 'zec') continue;
      if (!byChain[key]) byChain[key] = { chain: key, chainName: CHAIN_NAMES[key] || key.toUpperCase(), inflow: 0, outflow: 0, net: 0 };
      if (r.direction === 'inflow') byChain[key].inflow = r.volumeUsd || 0;
      else byChain[key].outflow = r.volumeUsd || 0;
    }
    return Object.values(byChain)
      .map((r) => ({ ...r, net: r.inflow - r.outflow }))
      .sort((a, b) => Math.abs(b.inflow) + Math.abs(b.outflow) - (Math.abs(a.inflow) + Math.abs(a.outflow)))
      .slice(0, 12);
  }, [data]);

  const chartHeight = Math.max(220, rows.length * 32);

  const controls = (
    <PeriodPillTags options={PERIOD_OPTIONS} value={period} onChange={setPeriod} aria-label="Net flow period" />
  );

  return (
    <ChartCard title="NET_FLOW_BY_CHAIN" controls={controls} height={chartHeight}>
      <p className="text-xs text-muted mb-3 max-w-2xl">
        Net ZEC volume per chain — inflow minus outflow. Green bars mean more ZEC arrived from that chain than left to it; red is the reverse.
      </p>
      {loading && rows.length === 0 ? (
        <div className="flex items-center justify-center" style={{ height: chartHeight - 20 }}>
          <div className="animate-pulse text-muted font-mono text-xs">Loading...</div>
        </div>
      ) : rows.length === 0 ? (
        <div className="flex items-center justify-center text-xs font-mono text-muted" style={{ height: chartHeight - 20 }}>No flow data available</div>
      ) : (
        <ResponsiveContainer width="100%" height={chartHeight - 20}>
          <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 16 }}>
            <CartesianGrid strokeDasharray="2 6" stroke={colors.grid} opacity={0.5} horizontal={false} />
            <XAxis type="number" stroke={colors.axis} tick={{ fill: colors.axis, fontSize: 10 }} tickFormatter={(v: number) => formatUSD(v)} />
            <YAxis
              type="category"
              dataKey="chainName"
              stroke={colors.axis}
              tick={{ fill: colors.tooltipText, fontSize: 11, fontFamily: 'monospace' }}
              width={90}
            />
            <ReferenceLine x={0} stroke={colors.grid} />
            <Tooltip content={<NetFlowTooltip colors={colors} />} cursor={{ fill: colors.barCursorCyan }} />
            <Bar dataKey="net" radius={[3, 3, 3, 3]} barSize={16}>
              {rows.map((r) => (
                <Cell key={r.chain} fill={r.net >= 0 ? 'var(--color-success)' : 'var(--color-danger)'} fillOpacity={0.8} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}
