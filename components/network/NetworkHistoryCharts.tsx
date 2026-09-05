'use client';

import { useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { useTheme } from '@/contexts/ThemeContext';
import { getChartColors } from '@/lib/chart-theme';
import { useApiQuery } from '@/hooks/useApiQuery';
import { ChartCard } from './ChartCard';

function ChartEmptyState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center h-[260px] text-xs text-muted text-center px-6">
      {message}
    </div>
  );
}

export interface ChainSizeHistoryResponse {
  points: { time: string; sizeGB: number }[];
}

export function NetworkHistoryCharts({ initialData }: { initialData?: ChainSizeHistoryResponse | null }) {
  const { theme } = useTheme();
  const colors = getChartColors(theme);

  const { data, loading } = useApiQuery<ChainSizeHistoryResponse>(
    '/api/network/chain-size-history',
    { period: '1y' },
    { initialData: initialData ?? undefined },
  );
  const sizePoints = useMemo(
    () => (data?.points ?? []).map((p) => ({
      time: new Date(p.time).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      sizeGB: p.sizeGB,
    })),
    [data],
  );

  return (
    <ChartCard title="BLOCKCHAIN_SIZE" height={260} watermarkSize="sm">
      {loading ? (
        <ChartEmptyState message="Loading chain size…" />
      ) : sizePoints.length > 0 ? (
        <ResponsiveContainer initialDimension={{ width: 500, height: 300 }} width="100%" height={260}>
          <LineChart data={sizePoints}>
            <CartesianGrid strokeDasharray="2 6" stroke={colors.grid} opacity={0.5} />
            <XAxis dataKey="time" stroke={colors.axis} tick={{ fill: colors.axis, fontSize: 10 }} interval="preserveStartEnd" />
            <YAxis stroke={colors.axis} tick={{ fill: colors.axis, fontSize: 10 }} tickFormatter={(v) => `${v.toFixed(0)} GB`} domain={['auto', 'auto']} />
            <Tooltip
              cursor={{ stroke: 'rgba(255,255,255,0.1)' }}
              contentStyle={{ backgroundColor: colors.tooltipBg, border: `1px solid ${colors.tooltipBorder}`, borderRadius: '8px', fontFamily: 'monospace', fontSize: 11 }}
              itemStyle={{ color: colors.tooltipText }}
              labelStyle={{ color: colors.tooltipText }}
              formatter={(v) => [`${Number(v).toFixed(2)} GB`, 'Chain size']}
            />
            <Line type="monotone" dataKey="sizeGB" stroke={colors.yellow} strokeWidth={2} dot={sizePoints.length === 1} />
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <ChartEmptyState message="Chain size history is still being collected. Check back soon." />
      )}
    </ChartCard>
  );
}
