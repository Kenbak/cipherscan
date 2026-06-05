'use client';

import { useEffect, useState } from 'react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { getApiUrl } from '@/lib/api-config';
import { useTheme } from '@/contexts/ThemeContext';
import { getChartColors } from '@/lib/chart-theme';
import { getFlowColors } from '@/lib/flow-colors';
import { formatZecCompact } from '@/lib/format-numbers';
import { ChartCard } from '@/components/network/ChartCard';
import { PeriodPillTags } from '@/components/ui/PeriodPillTags';
import { FlowLegend } from '@/components/pools/FlowLegend';

type Period = '30d' | '90d' | '1y';
type PoolFilter = 'all' | 'sapling' | 'orchard';

interface FlowPoint {
  date: string;
  shield: number;
  deshield: number;
  net: number;
  dateLabel: string;
}

export function FlowVolumeChart() {
  const { theme } = useTheme();
  const colors = getChartColors(theme);
  const flowColors = getFlowColors(theme);
  const [period, setPeriod] = useState<Period>('30d');
  const [poolFilter, setPoolFilter] = useState<PoolFilter>('all');
  const [points, setPoints] = useState<FlowPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(new Set());

  useEffect(() => {
    setLoading(true);
    fetch(`${getApiUrl()}/api/pools/flows?period=${period}&pool=${poolFilter}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.points) {
          setPoints(data.points.map((p: FlowPoint) => ({
            ...p,
            deshield: -Math.abs(p.deshield),
            dateLabel: new Date(p.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          })));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [period, poolFilter]);

  const poolOptions: { key: PoolFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'sapling', label: 'Sapling' },
    { key: 'orchard', label: 'Orchard' },
  ];

  return (
    <div className="space-y-3">
      <ChartCard
        title="FLOW_VOLUME"
        height={320}
        controls={
          <div className="flex flex-wrap gap-2 justify-end">
            <PeriodPillTags
              options={poolOptions}
              value={poolFilter}
              onChange={setPoolFilter}
              aria-label="Pool filter"
            />
            <PeriodPillTags
              options={[
                { key: '30d' as const, label: '30D' },
                { key: '90d' as const, label: '90D' },
                { key: '1y' as const, label: '1Y' },
              ]}
              value={period}
              onChange={setPeriod}
              aria-label="Flow chart period"
            />
          </div>
        }
      >
        {loading ? (
          <div className="flex items-center justify-center h-[320px]">
            <div className="w-full max-w-md space-y-3 px-6">
              <div className="h-4 skeleton-bg rounded animate-pulse" />
              <div className="h-48 skeleton-bg rounded animate-pulse" />
            </div>
          </div>
        ) : points.length === 0 ? (
          <div className="flex items-center justify-center h-[320px]">
            <span className="text-xs text-muted font-mono">No flow data available</span>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart
              data={points}
              barSize={Math.max(4, Math.floor(600 / points.length))}
              barGap={-Math.max(4, Math.floor(600 / points.length))}
            >
              <CartesianGrid strokeDasharray="2 6" stroke={colors.grid} opacity={0.5} />
              <XAxis
                dataKey="dateLabel"
                stroke={colors.axis}
                tick={{ fill: colors.axis, fontSize: 10 }}
                interval="preserveStartEnd"
              />
              <YAxis
                stroke={colors.axis}
                tick={{ fill: colors.axis, fontSize: 10 }}
                tickFormatter={v => formatZecCompact(Math.abs(v))}
                width={54}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: colors.tooltipBg,
                  border: `1px solid ${colors.tooltipBorder}`,
                  borderRadius: '8px',
                  fontSize: 12,
                }}
                formatter={(value: number, name: string) => {
                  const abs = Math.abs(value);
                  const label = name === 'deshield' ? 'Deshielded' : name === 'shield' ? 'Shielded' : 'Net Flow';
                  return [`${abs.toFixed(2)} ZEC`, label];
                }}
                labelStyle={{ color: colors.tooltipText, fontSize: 11 }}
              />
              <Legend
                wrapperStyle={{ fontSize: 11, paddingTop: 8, cursor: 'pointer' }}
                onClick={(e: { dataKey?: string }) => {
                  if (!e.dataKey) return;
                  setHiddenSeries(prev => {
                    const next = new Set(prev);
                    if (next.has(e.dataKey!)) next.delete(e.dataKey!);
                    else next.add(e.dataKey!);
                    return next;
                  });
                }}
                formatter={(value: string) => {
                  const label = value === 'shield' ? 'Shielded' : value === 'deshield' ? 'Deshielded' : 'Net Flow';
                  const hidden = hiddenSeries.has(value);
                  return <span style={{ opacity: hidden ? 0.35 : 1, textDecoration: hidden ? 'line-through' : 'none' }}>{label}</span>;
                }}
              />
              <ReferenceLine y={0} stroke={colors.grid} strokeDasharray="2 6" />
              <Bar
                dataKey="shield"
                fill={flowColors.shielding}
                fillOpacity={0.7}
                radius={[2, 2, 0, 0]}
                name="shield"
                hide={hiddenSeries.has('shield')}
              />
              <Bar
                dataKey="deshield"
                fill={flowColors.deshielding}
                fillOpacity={0.55}
                radius={[0, 0, 2, 2]}
                name="deshield"
                hide={hiddenSeries.has('deshield')}
              />
              <Line
                type="monotone"
                dataKey="net"
                stroke={colors.tooltipText}
                strokeWidth={2}
                strokeDasharray="4 3"
                dot={false}
                name="net"
                hide={hiddenSeries.has('net')}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </ChartCard>
      <FlowLegend />
    </div>
  );
}
