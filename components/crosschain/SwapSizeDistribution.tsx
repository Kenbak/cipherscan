'use client';

import { useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { useTheme } from '@/contexts/ThemeContext';
import { getChartColors } from '@/lib/chart-theme';
import { useApiQuery } from '@/hooks/useApiQuery';
import { ChartCard } from '@/components/network/ChartCard';
import { formatUSD, formatValue, type DisplayUnit } from '@/components/crosschain/format';

interface BucketData {
  bucket: string;
  centroid: number;
  swapCount: number;
  volumeUsd: number;
}

interface SizeDistributionResponse {
  success: boolean;
  buckets: BucketData[];
}

type ViewMode = 'count' | 'volume';

function bucketLabel(centroid: number): string {
  if (centroid < 10) return '<$10';
  if (centroid < 50) return '$10–50';
  if (centroid < 100) return '$50–100';
  if (centroid < 500) return '$100–500';
  if (centroid < 1000) return '$500–1K';
  if (centroid < 5000) return '$1K–5K';
  if (centroid < 10000) return '$5K–10K';
  if (centroid < 50000) return '$10K–50K';
  return '$50K+';
}

const FIXED_BUCKETS = [
  { min: 0, max: 10, label: '<$10' },
  { min: 10, max: 50, label: '$10–50' },
  { min: 50, max: 100, label: '$50–100' },
  { min: 100, max: 500, label: '$100–500' },
  { min: 500, max: 1000, label: '$500–1K' },
  { min: 1000, max: 5000, label: '$1K–5K' },
  { min: 5000, max: 10000, label: '$5K–10K' },
  { min: 10000, max: 50000, label: '$10K–50K' },
  { min: 50000, max: Infinity, label: '$50K+' },
];

function SizeTooltip({ active, payload, colors, viewMode, unit, zecPrice }: {
  active?: boolean;
  payload?: Array<{ payload?: { label: string; swapCount: number; volumeUsd: number } }>;
  colors: ReturnType<typeof getChartColors>;
  viewMode: ViewMode;
  unit: DisplayUnit;
  zecPrice: number | null;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  const fv = (v: number) => formatValue(v, unit, zecPrice);

  return (
    <div
      className="rounded-lg border px-3 py-2 text-xs font-mono shadow-lg"
      style={{ backgroundColor: colors.tooltipBg, borderColor: colors.tooltipBorder, color: colors.tooltipText }}
    >
      <p className="mb-1 text-[10px] uppercase tracking-wider text-muted">{row.label}</p>
      <p className="tabular-nums text-secondary">{row.swapCount.toLocaleString()} swaps</p>
      <p className="tabular-nums text-secondary">{fv(row.volumeUsd)} volume</p>
    </div>
  );
}

export function SwapSizeDistribution({ unit = 'usd', zecPrice = null }: { unit?: DisplayUnit; zecPrice?: number | null }) {
  const { theme } = useTheme();
  const colors = getChartColors(theme);
  const [viewMode, setViewMode] = useState<ViewMode>('count');

  const { data, loading } = useApiQuery<SizeDistributionResponse>('/api/crosschain/size-distribution');

  const chartData = useMemo(() => {
    if (!data?.buckets?.length) return [];

    const grouped = FIXED_BUCKETS.map(fb => ({
      label: fb.label,
      swapCount: 0,
      volumeUsd: 0,
    }));

    for (const b of data.buckets) {
      const usdValue = b.centroid;
      const idx = FIXED_BUCKETS.findIndex(fb => usdValue >= fb.min && usdValue < fb.max);
      if (idx >= 0) {
        grouped[idx].swapCount += b.swapCount;
        grouped[idx].volumeUsd += b.volumeUsd;
      }
    }

    return grouped.filter(g => g.swapCount > 0 || g.volumeUsd > 0);
  }, [data]);

  const dataKey = viewMode === 'count' ? 'swapCount' : 'volumeUsd';
  const fv = (v: number) => viewMode === 'volume' ? formatValue(v, unit, zecPrice) : v.toLocaleString();

  return (
    <ChartCard title="SIZE_DISTRIBUTION" height={280}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-muted max-w-sm">30d swap sizes by USD value range</p>
        <div className="filter-group">
          <button onClick={() => setViewMode('count')} className={`filter-btn ${viewMode === 'count' ? 'filter-btn-active' : ''}`}>Count</button>
          <button onClick={() => setViewMode('volume')} className={`filter-btn ${viewMode === 'volume' ? 'filter-btn-active' : ''}`}>Volume</button>
        </div>
      </div>
      {loading && chartData.length === 0 ? (
        <div className="flex items-center justify-center h-[200px]">
          <div className="animate-pulse text-muted font-mono text-xs">Loading...</div>
        </div>
      ) : chartData.length === 0 ? (
        <div className="flex items-center justify-center h-[200px] text-xs font-mono text-muted">No size data available</div>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData} margin={{ left: 0, right: 8 }}>
            <CartesianGrid strokeDasharray="2 6" stroke={colors.grid} opacity={0.5} />
            <XAxis dataKey="label" stroke={colors.axis} tick={{ fill: colors.axis, fontSize: 9 }} interval={0} angle={-30} textAnchor="end" height={50} />
            <YAxis stroke={colors.axis} tick={{ fill: colors.axis, fontSize: 10 }} tickFormatter={(v: number) => fv(v)} width={50} />
            <Tooltip content={<SizeTooltip colors={colors} viewMode={viewMode} unit={unit} zecPrice={zecPrice} />} cursor={{ fill: colors.barCursor }} />
            <Bar dataKey={dataKey} fill="var(--color-cipher-purple)" fillOpacity={0.75} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}
