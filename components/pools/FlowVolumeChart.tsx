'use client';

import { useEffect, useState } from 'react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { getApiUrl } from '@/lib/api-config';
import { useTheme } from '@/contexts/ThemeContext';
import { getChartColors } from '@/lib/chart-theme';
import { formatZecCompact } from '@/lib/format-numbers';
import { ChartCard } from '@/components/network/ChartCard';

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
  const [period, setPeriod] = useState<Period>('30d');
  const [poolFilter, setPoolFilter] = useState<PoolFilter>('all');
  const [points, setPoints] = useState<FlowPoint[]>([]);
  const [loading, setLoading] = useState(true);

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

  const deshieldColor = theme === 'dark' ? '#E8C48D' : '#c9a066';

  return (
    <ChartCard
      title="FLOW_VOLUME"
      height={320}
      controls={
        <div className="flex flex-wrap gap-1 justify-end">
          <div className="flex gap-1 mr-2">
            {poolOptions.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setPoolFilter(key)}
                className={`px-2 py-1 text-[10px] font-mono rounded ${
                  poolFilter === key
                    ? 'bg-cipher-purple/10 text-cipher-purple border border-cipher-purple/30'
                    : 'text-muted'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {(['30d', '90d', '1y'] as Period[]).map(p => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={`px-2 py-1 text-[10px] font-mono rounded ${
                period === p
                  ? 'bg-cipher-cyan/10 text-cipher-cyan border border-cipher-cyan/30'
                  : 'text-muted'
              }`}
            >
              {p.toUpperCase()}
            </button>
          ))}
        </div>
      }
    >
      {loading ? (
        <div className="flex items-center justify-center h-[320px]">
          <span className="text-xs text-muted font-mono">Loading flow data...</span>
        </div>
      ) : points.length === 0 ? (
        <div className="flex items-center justify-center h-[320px]">
          <span className="text-xs text-muted font-mono">No flow data available</span>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={320}>
          <ComposedChart data={points} barCategoryGap="15%">
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
            <ReferenceLine y={0} stroke={colors.grid} strokeDasharray="2 6" />
            <Bar dataKey="shield" fill={colors.cyan} fillOpacity={0.7} radius={[2, 2, 0, 0]} name="shield" />
            <Bar dataKey="deshield" fill={deshieldColor} fillOpacity={0.5} radius={[0, 0, 2, 2]} name="deshield" />
            <Line
              type="monotone"
              dataKey="net"
              stroke={colors.tooltipText}
              strokeWidth={2}
              dot={false}
              name="net"
            />
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}
