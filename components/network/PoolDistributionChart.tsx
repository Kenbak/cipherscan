'use client';

import { useEffect, useState } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { getApiUrl } from '@/lib/api-config';
import { useTheme } from '@/contexts/ThemeContext';
import { getChartColors } from '@/lib/chart-theme';
import { ChartCard } from './ChartCard';

type Period = '30d' | '90d' | '1y';

interface PoolPoint {
  date: string;
  shielded: number;
  sprout: number;
  sapling: number;
  orchard: number;
  transparent: number;
  shieldedSupplyPct: number;
  hasPoolBreakdown?: boolean;
}

export function PoolDistributionChart() {
  const { theme } = useTheme();
  const colors = getChartColors(theme);
  const [period, setPeriod] = useState<Period>('1y');
  const [points, setPoints] = useState<PoolPoint[]>([]);
  const [hasBreakdown, setHasBreakdown] = useState(false);

  useEffect(() => {
    fetch(`${getApiUrl()}/api/network/pool-history?period=${period}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.points) setPoints(data.points);
        setHasBreakdown(!!data?.hasPoolBreakdown);
      })
      .catch(() => {});
  }, [period]);

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const chartData = points.map((p) => ({
    ...p,
    dateLabel: formatDate(String(p.date)),
    shieldedPct: p.shieldedSupplyPct,
  }));

  const breakdownPoints = chartData.filter(
    (d) => d.orchard > 0 || d.sapling > 0 || d.transparent > 0
  );
  // Stacked pools when enough days have per-pool breakdown
  const useStackedBreakdown =
    hasBreakdown &&
    breakdownPoints.length >= Math.min(14, Math.ceil(chartData.length * 0.5));

  const pctValues = chartData.map((d) => d.shieldedPct).filter((v): v is number => v != null && v > 0);
  const yMin = pctValues.length ? Math.max(0, Math.floor(Math.min(...pctValues) - 2)) : 0;
  const yMax = pctValues.length ? Math.ceil(Math.max(...pctValues) + 2) : 100;

  return (
    <div className="space-y-3">
      <ChartCard
        title="SHIELDED_SUPPLY_SHARE"
        height={320}
        watermarkSize="lg"
        controls={
          <div className="flex gap-1">
            {(['30d', '90d', '1y'] as Period[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                className={`px-2 py-1 text-[10px] font-mono rounded ${
                  period === p ? 'bg-cipher-cyan/10 text-cipher-cyan border border-cipher-cyan/30' : 'text-muted'
                }`}
              >
                {p.toUpperCase()}
              </button>
            ))}
          </div>
        }
      >
        <ResponsiveContainer width="100%" height={320}>
          {useStackedBreakdown ? (
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="2 6" stroke={colors.grid} opacity={0.5} />
              <XAxis dataKey="dateLabel" stroke={colors.axis} tick={{ fill: colors.axis, fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis stroke={colors.axis} tick={{ fill: colors.axis, fontSize: 10 }} tickFormatter={(v) => `${(v / 1e6).toFixed(1)}M`} />
              <Tooltip
                contentStyle={{ backgroundColor: colors.tooltipBg, border: `1px solid ${colors.tooltipBorder}`, borderRadius: '8px' }}
                formatter={(value: number, name: string) => [`${(value / 1e6).toFixed(3)}M ZEC`, name]}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area type="monotone" dataKey="orchard" stackId="1" stroke={colors.orchard} fill={colors.orchard} fillOpacity={0.6} name="Orchard" />
              <Area type="monotone" dataKey="sapling" stackId="1" stroke={colors.sapling} fill={colors.sapling} fillOpacity={0.6} name="Sapling" />
              <Area type="monotone" dataKey="sprout" stackId="1" stroke={colors.sprout} fill={colors.sprout} fillOpacity={0.5} name="Sprout" />
              <Area type="monotone" dataKey="transparent" stackId="1" stroke={colors.transparent} fill={colors.transparent} fillOpacity={0.4} name="Transparent" />
            </AreaChart>
          ) : (
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="2 6" stroke={colors.grid} opacity={0.5} />
              <XAxis dataKey="dateLabel" stroke={colors.axis} tick={{ fill: colors.axis, fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis stroke={colors.axis} tick={{ fill: colors.axis, fontSize: 10 }} domain={[yMin, yMax]} tickFormatter={(v) => `${v.toFixed(0)}%`} />
              <Tooltip
                contentStyle={{ backgroundColor: colors.tooltipBg, border: `1px solid ${colors.tooltipBorder}`, borderRadius: '8px' }}
                formatter={(value: number) => [`${Number(value).toFixed(2)}%`, 'Shielded supply share']}
              />
              <Area type="monotone" dataKey="shieldedPct" stroke={colors.shielded} fill={colors.shielded} fillOpacity={0.25} name="Shielded supply share" />
            </AreaChart>
          )}
        </ResponsiveContainer>
      </ChartCard>
      <p className="text-xs text-muted leading-relaxed -mt-2">
        {useStackedBreakdown
          ? 'Daily ZEC in each value pool (Sprout, Sapling, Orchard, Transparent).'
          : 'Share of all mined ZEC held in shielded pools (Sprout + Sapling + Orchard). Per-pool breakdown fills in as daily snapshots accumulate.'}
        {' '}Not transaction volume — see the Privacy page for tx adoption.
      </p>
    </div>
  );
}
