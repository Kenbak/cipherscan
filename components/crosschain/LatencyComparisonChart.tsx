'use client';

import { useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { useTheme } from '@/contexts/ThemeContext';
import { getChartColors } from '@/lib/chart-theme';
import { ChartCard } from '@/components/network/ChartCard';

export interface LatencyStat {
  chain: string;
  chainName: string;
  avgMinutes: number;
  medianMinutes: number;
  swapCount: number;
}

interface LatencyRow {
  chain: string;
  chainName: string;
  inboundMedian: number;
  inboundCount: number;
  outboundMedian: number;
  outboundCount: number;
  totalCount: number;
}

const TOP_N = 10;

function formatMinutes(m: number): string {
  if (m <= 0) return '—';
  if (m < 60) return `${m.toFixed(0)}m`;
  return `${(m / 60).toFixed(1)}h`;
}

function LatencyTooltip({ active, payload, colors }: {
  active?: boolean;
  payload?: Array<{ payload?: LatencyRow }>;
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
      {row.inboundCount > 0 && (
        <p className="tabular-nums text-secondary">
          <span className="text-cipher-cyan">Buy ZEC</span>: {formatMinutes(row.inboundMedian)} median · {row.inboundCount.toLocaleString()} swaps
        </p>
      )}
      {row.outboundCount > 0 && (
        <p className="tabular-nums text-secondary">
          <span className="text-cipher-orange">Sell ZEC</span>: {formatMinutes(row.outboundMedian)} median · {row.outboundCount.toLocaleString()} swaps
        </p>
      )}
    </div>
  );
}

export function LatencyComparisonChart({ inbound, outbound }: { inbound: LatencyStat[]; outbound: LatencyStat[] }) {
  const { theme } = useTheme();
  const colors = getChartColors(theme);
  const [showAll, setShowAll] = useState(false);

  const rows: LatencyRow[] = useMemo(() => {
    const byChain: Record<string, LatencyRow> = {};
    for (const s of inbound) {
      if (s.medianMinutes <= 0) continue;
      byChain[s.chain] ??= { chain: s.chain, chainName: s.chainName, inboundMedian: 0, inboundCount: 0, outboundMedian: 0, outboundCount: 0, totalCount: 0 };
      byChain[s.chain].inboundMedian = s.medianMinutes;
      byChain[s.chain].inboundCount = s.swapCount;
    }
    for (const s of outbound) {
      if (s.medianMinutes <= 0) continue;
      byChain[s.chain] ??= { chain: s.chain, chainName: s.chainName, inboundMedian: 0, inboundCount: 0, outboundMedian: 0, outboundCount: 0, totalCount: 0 };
      byChain[s.chain].outboundMedian = s.medianMinutes;
      byChain[s.chain].outboundCount = s.swapCount;
    }
    return Object.values(byChain)
      .map((r) => ({ ...r, totalCount: r.inboundCount + r.outboundCount }))
      .sort((a, b) => b.totalCount - a.totalCount);
  }, [inbound, outbound]);

  const topRows = rows.slice(0, TOP_N);
  const longTail = rows.slice(TOP_N);
  const displayRows = showAll ? rows : topRows;
  const chartHeight = Math.max(240, displayRows.length * 38);

  if (rows.length === 0) return null;

  return (
    <ChartCard title="ZEC_LATENCY_BY_CHAIN" height={chartHeight}>
      <p className="text-xs text-muted mb-3 max-w-2xl">
        Median time from swap initiation to ZEC confirmation, by chain and direction. Sorted by swap volume — the busiest routes are the most statistically reliable.
      </p>
      <ResponsiveContainer width="100%" height={chartHeight - 20}>
        <BarChart data={displayRows} layout="vertical" margin={{ left: 8, right: 24 }}>
          <CartesianGrid strokeDasharray="2 6" stroke={colors.grid} opacity={0.5} horizontal={false} />
          <XAxis type="number" stroke={colors.axis} tick={{ fill: colors.axis, fontSize: 10 }} tickFormatter={(v: number) => formatMinutes(v)} />
          <YAxis
            type="category"
            dataKey="chainName"
            stroke={colors.axis}
            tick={{ fill: colors.tooltipText, fontSize: 11, fontFamily: 'monospace' }}
            width={90}
          />
          <Tooltip content={<LatencyTooltip colors={colors} />} cursor={{ fill: colors.barCursorCyan }} />
          <Legend
            wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
            formatter={(value) => value === 'inboundMedian' ? 'Buy ZEC (inbound)' : 'Sell ZEC (outbound)'}
          />
          <Bar dataKey="inboundMedian" name="inboundMedian" fill="var(--color-cipher-cyan)" fillOpacity={0.85} radius={[0, 3, 3, 0]} barSize={9} />
          <Bar dataKey="outboundMedian" name="outboundMedian" fill="var(--color-cipher-orange)" fillOpacity={0.85} radius={[0, 3, 3, 0]} barSize={9} />
        </BarChart>
      </ResponsiveContainer>

      {longTail.length > 0 && (
        <div className="mt-3 pt-3 border-t border-cipher-border">
          <button
            onClick={() => setShowAll((v) => !v)}
            className="text-[11px] font-mono text-cipher-cyan hover:underline"
          >
            {showAll ? '← Show top 10 only' : `Show ${longTail.length} more low-volume chains →`}
          </button>
          {!showAll && (
            <p className="text-[10px] text-muted mt-1.5 leading-relaxed">
              {longTail.slice(0, 8).map((r) => r.chainName).join(', ')}
              {longTail.length > 8 ? `, +${longTail.length - 8} more` : ''} — under {TOP_N === 10 ? topRows[topRows.length - 1]?.totalCount.toLocaleString() : ''} swaps each, latency less statistically reliable.
            </p>
          )}
        </div>
      )}
    </ChartCard>
  );
}
