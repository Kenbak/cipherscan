'use client';

import { useEffect, useState } from 'react';
import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine,
} from 'recharts';
import { getApiUrl } from '@/lib/api-config';
import { useTheme } from '@/contexts/ThemeContext';
import { getChartColors } from '@/lib/chart-theme';
import { formatZecCompact } from '@/lib/format-numbers';
import { ChartCard } from './ChartCard';
import { PeriodPillTags } from '@/components/ui/PeriodPillTags';

type Period = '30d' | '90d' | '1y';
type View = 'composition' | 'pools' | 'share';

const MAX_ZEC_SUPPLY = 21_000_000;

interface PoolPoint {
  date: string;
  shielded: number;
  sprout: number;
  sapling: number;
  orchard: number;
  transparent: number;
  shieldedSupplyPct: number | null;
}

export function PoolDistributionChart() {
  const { theme } = useTheme();
  const colors = getChartColors(theme);
  const [period, setPeriod] = useState<Period>('1y');
  const [view, setView] = useState<View>('composition');
  const [points, setPoints] = useState<PoolPoint[]>([]);
  const [hasPerPoolHistory, setHasPerPoolHistory] = useState(false);
  const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch(`${getApiUrl()}/api/network/pool-history?period=${period}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.points) setPoints(data.points);
        setHasPerPoolHistory(!!data?.hasVerifiedPerPoolBreakdown);
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

  const pctValues = chartData.map((d) => d.shieldedPct).filter((v): v is number => v != null && v > 0);
  const yMin = pctValues.length ? Math.max(0, Math.floor(Math.min(...pctValues) - 2)) : 0;
  const yMax = pctValues.length ? Math.ceil(Math.max(...pctValues) + 2) : 100;

  const canShowPools = hasPerPoolHistory || points.some((p) => p.orchard > 0);

  const viewOptions: { key: View; label: string }[] = [
    { key: 'composition', label: 'ZEC' },
    ...(canShowPools ? [{ key: 'pools' as View, label: 'Pools' }] : []),
    { key: 'share', label: '%' },
  ];

  return (
    <div className="space-y-3">
      <ChartCard
        title="SHIELDED_SUPPLY"
        height={320}
        watermarkSize="lg"
        controls={
          <div className="flex flex-wrap gap-2 justify-end">
            <PeriodPillTags
              options={viewOptions}
              value={view}
              onChange={setView}
              aria-label="Supply chart view"
            />
            <PeriodPillTags
              options={[
                { key: '30d' as const, label: '30D' },
                { key: '90d' as const, label: '90D' },
                { key: '1y' as const, label: '1Y' },
              ]}
              value={period}
              onChange={setPeriod}
              aria-label="Supply chart period"
            />
          </div>
        }
      >
        <ResponsiveContainer width="100%" height={320}>
          {view === 'pools' && canShowPools ? (
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="2 6" stroke={colors.grid} opacity={0.5} />
              <XAxis dataKey="dateLabel" stroke={colors.axis} tick={{ fill: colors.axis, fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis
                stroke={colors.axis}
                tick={{ fill: colors.axis, fontSize: 10 }}
                tickFormatter={(v) => formatZecCompact(v)}
                domain={[0, MAX_ZEC_SUPPLY]}
                ticks={[0, 5_000_000, 10_000_000, 15_000_000, 21_000_000]}
                width={48}
              />
              <Tooltip
                contentStyle={{ backgroundColor: colors.tooltipBg, border: `1px solid ${colors.tooltipBorder}`, borderRadius: '8px' }}
                formatter={(value: number, name: string) => [`${(value / 1e6).toFixed(3)}M ZEC`, name]}
              />
              <Legend
                wrapperStyle={{ fontSize: 11, cursor: 'pointer' }}
                onClick={(data) => {
                  const key = String(data.dataKey ?? '');
                  if (!key) return;
                  setHiddenSeries(prev => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; });
                }}
                formatter={(value, entry) => {
                  const hidden = hiddenSeries.has(String(entry.dataKey ?? ''));
                  return <span style={{ opacity: hidden ? 0.35 : 1, textDecoration: hidden ? 'line-through' : 'none' }}>{value}</span>;
                }}
              />
              <Area type="monotone" dataKey="orchard" stackId="1" stroke={colors.orchard} fill={colors.orchard} fillOpacity={0.6} name="Orchard" hide={hiddenSeries.has('orchard')} />
              <Area type="monotone" dataKey="sapling" stackId="1" stroke={colors.sapling} fill={colors.sapling} fillOpacity={0.6} name="Sapling" hide={hiddenSeries.has('sapling')} />
              <Area type="monotone" dataKey="sprout" stackId="1" stroke={colors.sprout} fill={colors.sprout} fillOpacity={0.5} name="Sprout" hide={hiddenSeries.has('sprout')} />
              <Area type="monotone" dataKey="transparent" stackId="1" stroke={colors.transparent} fill={colors.transparent} fillOpacity={0.35} name="Transparent" hide={hiddenSeries.has('transparent')} />
            </AreaChart>
          ) : view === 'composition' ? (
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="2 6" stroke={colors.grid} opacity={0.5} />
              <XAxis dataKey="dateLabel" stroke={colors.axis} tick={{ fill: colors.axis, fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis
                stroke={colors.axis}
                tick={{ fill: colors.axis, fontSize: 10 }}
                tickFormatter={(v) => formatZecCompact(v)}
                domain={[0, MAX_ZEC_SUPPLY]}
                ticks={[0, 5_000_000, 10_000_000, 15_000_000, 21_000_000]}
                width={48}
              />
              <ReferenceLine y={MAX_ZEC_SUPPLY} stroke={colors.axis} strokeDasharray="4 4" strokeOpacity={0.35} />
              <Tooltip
                contentStyle={{ backgroundColor: colors.tooltipBg, border: `1px solid ${colors.tooltipBorder}`, borderRadius: '8px' }}
                formatter={(value: number, name: string) => [`${(value / 1e6).toFixed(3)}M ZEC`, name]}
              />
              <Legend
                wrapperStyle={{ fontSize: 11, cursor: 'pointer' }}
                onClick={(data) => {
                  const key = String(data.dataKey ?? '');
                  if (!key) return;
                  setHiddenSeries(prev => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; });
                }}
                formatter={(value, entry) => {
                  const hidden = hiddenSeries.has(String(entry.dataKey ?? ''));
                  return <span style={{ opacity: hidden ? 0.35 : 1, textDecoration: hidden ? 'line-through' : 'none' }}>{value}</span>;
                }}
              />
              <Area type="monotone" dataKey="shielded" stackId="1" stroke={colors.shielded} fill={colors.shielded} fillOpacity={0.55} name="Shielded" hide={hiddenSeries.has('shielded')} />
              <Area type="monotone" dataKey="transparent" stackId="1" stroke={colors.transparent} fill={colors.transparent} fillOpacity={0.35} name="Transparent" hide={hiddenSeries.has('transparent')} />
            </AreaChart>
          ) : (
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="2 6" stroke={colors.grid} opacity={0.5} />
              <XAxis dataKey="dateLabel" stroke={colors.axis} tick={{ fill: colors.axis, fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis stroke={colors.axis} tick={{ fill: colors.axis, fontSize: 10 }} domain={[yMin, yMax]} tickFormatter={(v) => `${v.toFixed(0)}%`} />
              <Tooltip
                contentStyle={{ backgroundColor: colors.tooltipBg, border: `1px solid ${colors.tooltipBorder}`, borderRadius: '8px' }}
                formatter={(value: number) => [`${Number(value).toFixed(2)}%`, 'Shielded share of supply']}
              />
              <Line type="monotone" dataKey="shieldedPct" stroke={colors.shielded} strokeWidth={2} dot={false} name="Shielded share" />
            </LineChart>
          )}
        </ResponsiveContainer>
      </ChartCard>
      <p className="text-xs text-muted leading-relaxed -mt-2">
        {view === 'pools'
          ? 'Daily value pools from chain state (Orchard, Sapling, Sprout, Transparent). Orchard share growth over time is real data.'
          : 'Shielded vs transparent supply from daily chain totals. Use Pools view for Sprout/Sapling/Orchard history when available.'}
        {' '}Not transaction volume — see the Privacy page for tx adoption.
      </p>
    </div>
  );
}
