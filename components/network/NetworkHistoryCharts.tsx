'use client';

import { useEffect, useState } from 'react';
import {
  LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { getApiUrl } from '@/lib/api-config';
import { useTheme } from '@/contexts/ThemeContext';
import { getChartColors } from '@/lib/chart-theme';
import { formatZecCompact } from '@/lib/format-numbers';
import { ChartCard } from './ChartCard';

const MAX_ZEC_SUPPLY = 21_000_000;

function ChartEmptyState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center h-[260px] text-xs text-muted text-center px-6">
      {message}
    </div>
  );
}

export function NetworkHistoryCharts() {
  const { theme } = useTheme();
  const colors = getChartColors(theme);
  const [supplyPoints, setSupplyPoints] = useState<{ date: string; circulating: number }[]>([]);
  const [sizePoints, setSizePoints] = useState<{ time: string; sizeGB: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`${getApiUrl()}/api/network/emission?period=1y`).then((r) => (r.ok ? r.json() : null)),
      fetch(`${getApiUrl()}/api/network/chain-size-history?period=1y`).then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([emission, size]) => {
        if (emission?.supplyHistory?.length) {
          setSupplyPoints(
            emission.supplyHistory.map((p: { date: string; circulating: number }) => ({
              date: new Date(p.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
              circulating: p.circulating,
            }))
          );
        }
        if (size?.points?.length) {
          setSizePoints(
            size.points.map((p: { time: string; sizeGB: number }) => ({
              time: new Date(p.time).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
              sizeGB: p.sizeGB,
            }))
          );
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <ChartCard title="CIRCULATING_SUPPLY" height={260} watermarkSize="sm">
        {loading ? (
          <ChartEmptyState message="Loading supply history…" />
        ) : supplyPoints.length > 0 ? (
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={supplyPoints}>
              <CartesianGrid strokeDasharray="2 6" stroke={colors.grid} opacity={0.5} />
              <XAxis dataKey="date" stroke={colors.axis} tick={{ fill: colors.axis, fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis
                stroke={colors.axis}
                tick={{ fill: colors.axis, fontSize: 10 }}
                tickFormatter={(v) => `${formatZecCompact(v)}`}
                domain={[0, MAX_ZEC_SUPPLY]}
                ticks={[0, 5_000_000, 10_000_000, 15_000_000, 21_000_000]}
                width={48}
              />
              <ReferenceLine
                y={MAX_ZEC_SUPPLY}
                stroke={colors.axis}
                strokeDasharray="4 4"
                strokeOpacity={0.35}
                label={{
                  value: '21M cap',
                  position: 'insideTopRight',
                  fill: colors.axis,
                  fontSize: 10,
                }}
              />
              <Tooltip
                contentStyle={{ backgroundColor: colors.tooltipBg, border: `1px solid ${colors.tooltipBorder}`, borderRadius: '8px' }}
                formatter={(v) => [
                  `${(Number(v) / 1e6).toFixed(2)}M ZEC (${((Number(v) / MAX_ZEC_SUPPLY) * 100).toFixed(1)}% of max)`,
                  'Circulating',
                ]}
              />
              <Area type="monotone" dataKey="circulating" stroke={colors.cyan} fill={colors.cyan} fillOpacity={0.2} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <ChartEmptyState message="Supply history is still being collected. Check back soon." />
        )}
      </ChartCard>

      <ChartCard title="BLOCKCHAIN_SIZE" height={260} watermarkSize="sm">
        {loading ? (
          <ChartEmptyState message="Loading chain size…" />
        ) : sizePoints.length > 0 ? (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={sizePoints}>
              <CartesianGrid strokeDasharray="2 6" stroke={colors.grid} opacity={0.5} />
              <XAxis dataKey="time" stroke={colors.axis} tick={{ fill: colors.axis, fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis stroke={colors.axis} tick={{ fill: colors.axis, fontSize: 10 }} tickFormatter={(v) => `${v.toFixed(0)} GB`} domain={['auto', 'auto']} />
              <Tooltip
                contentStyle={{ backgroundColor: colors.tooltipBg, border: `1px solid ${colors.tooltipBorder}`, borderRadius: '8px' }}
                formatter={(v) => [`${Number(v).toFixed(2)} GB`, 'Chain size']}
              />
              <Line type="monotone" dataKey="sizeGB" stroke={colors.yellow} strokeWidth={2} dot={sizePoints.length === 1} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <ChartEmptyState message="Chain size history is still being collected. Check back soon." />
        )}
      </ChartCard>
    </div>
  );
}
