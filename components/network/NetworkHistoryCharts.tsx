'use client';

import { useEffect, useState } from 'react';
import {
  LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { getApiUrl } from '@/lib/api-config';
import { useTheme } from '@/contexts/ThemeContext';
import { getChartColors } from '@/lib/chart-theme';
import { formatZecCompact } from '@/lib/format-numbers';
import { ChartCard } from './ChartCard';

export function NetworkHistoryCharts() {
  const { theme } = useTheme();
  const colors = getChartColors(theme);
  const [supplyPoints, setSupplyPoints] = useState<{ date: string; circulating: number }[]>([]);
  const [sizePoints, setSizePoints] = useState<{ time: string; sizeGB: number }[]>([]);
  const [hasSnapshots, setHasSnapshots] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch(`${getApiUrl()}/api/network/emission?period=1y`).then((r) => (r.ok ? r.json() : null)),
      fetch(`${getApiUrl()}/api/network/chain-size-history?period=90d`).then((r) => (r.ok ? r.json() : null)),
    ]).then(([emission, size]) => {
      if (emission?.supplyHistory?.length) {
        setSupplyPoints(
          emission.supplyHistory.map((p: { date: string; circulating: number }) => ({
            date: new Date(p.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            circulating: p.circulating,
          }))
        );
        setHasSnapshots(true);
      }
      if (size?.points?.length) {
        setSizePoints(
          size.points.map((p: { time: string; sizeGB: number }) => ({
            time: new Date(p.time).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            sizeGB: p.sizeGB,
          }))
        );
      }
    }).catch(() => {});
  }, []);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <ChartCard title="CIRCULATING_SUPPLY" height={260} watermarkSize="sm">
        {supplyPoints.length > 0 ? (
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={supplyPoints}>
              <CartesianGrid strokeDasharray="2 6" stroke={colors.grid} opacity={0.5} />
              <XAxis dataKey="date" stroke={colors.axis} tick={{ fill: colors.axis, fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis stroke={colors.axis} tick={{ fill: colors.axis, fontSize: 10 }} tickFormatter={(v) => `${formatZecCompact(v)}`} domain={['auto', 'auto']} />
              <Tooltip
                contentStyle={{ backgroundColor: colors.tooltipBg, border: `1px solid ${colors.tooltipBorder}`, borderRadius: '8px' }}
                formatter={(v: number) => [`${v.toFixed(2)}M ZEC`, 'Circulating']}
              />
              <Area type="monotone" dataKey="circulating" stroke={colors.cyan} fill={colors.cyan} fillOpacity={0.2} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-[260px] text-xs text-muted font-mono text-center px-6">
            {hasSnapshots ? 'Collecting supply history…' : 'Enable chain snapshots cron for supply history (see docs/network-analytics-setup.md)'}
          </div>
        )}
      </ChartCard>

      <ChartCard title="BLOCKCHAIN_SIZE" height={260} watermarkSize="sm">
        {sizePoints.length > 0 ? (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={sizePoints}>
              <CartesianGrid strokeDasharray="2 6" stroke={colors.grid} opacity={0.5} />
              <XAxis dataKey="time" stroke={colors.axis} tick={{ fill: colors.axis, fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis stroke={colors.axis} tick={{ fill: colors.axis, fontSize: 10 }} tickFormatter={(v) => `${v.toFixed(0)} GB`} domain={['auto', 'auto']} />
              <Tooltip
                contentStyle={{ backgroundColor: colors.tooltipBg, border: `1px solid ${colors.tooltipBorder}`, borderRadius: '8px' }}
                formatter={(v: number) => [`${v.toFixed(2)} GB`, 'Chain size']}
              />
              <Line type="monotone" dataKey="sizeGB" stroke={colors.yellow} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-[260px] text-xs text-muted font-mono text-center px-6">
            Chain size history starts after hourly snapshots run
          </div>
        )}
      </ChartCard>
    </div>
  );
}
