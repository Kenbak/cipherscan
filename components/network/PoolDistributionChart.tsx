'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { getApiUrl } from '@/lib/api-config';
import { useTheme } from '@/contexts/ThemeContext';
import { getChartColors } from '@/lib/chart-theme';
import { formatZecCompact } from '@/lib/format-numbers';
import { ChartCard } from './ChartCard';
import {
  privacyXAxisTitle,
  privacyYAxisLabel,
} from '@/components/privacy/privacy-chart-axis';

type Period = '30d' | '90d' | '1y' | 'all';
type View = 'rate' | 'composition' | 'pools';

const VIEW_META: Record<View, { description: string }> = {
  rate: {
    description:
      'Shielded share of circulating supply over time. Use ZEC or Pools for absolute balances. Not transaction volume — see the Privacy page for tx adoption.',
  },
  composition: {
    description:
      'Shielded vs transparent supply from daily chain totals. Y-axis scales to current supply, not the 21M cap.',
  },
  pools: {
    description: 'Daily value pools from chain state when per-pool history is available.',
  },
};

interface PoolPoint {
  date: string;
  shielded: number;
  sprout: number;
  sapling: number;
  orchard: number;
  ironwood: number;
  transparent: number;
  shieldedSupplyPct: number | null;
}

function segmentedClass(active: boolean) {
  return `px-2 py-1 text-[10px] font-mono uppercase tracking-wide rounded transition-all whitespace-nowrap ${
    active ? 'bg-cipher-cyan/15 text-cipher-cyan font-bold' : 'text-muted hover:text-primary'
  }`;
}

function formatChartDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined });
}

function RateTooltip({
  active,
  payload,
  label,
  colors,
}: {
  active?: boolean;
  payload?: Array<{ payload: Record<string, unknown> }>;
  label?: string;
  colors: ReturnType<typeof getChartColors>;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  const rate = row.shieldedPct as number | null;
  const shielded = row.shielded as number;
  const transparent = row.transparent as number;
  const total = shielded + transparent;

  return (
    <div
      className="rounded-lg border px-3 py-2 text-xs font-mono shadow-lg"
      style={{
        backgroundColor: colors.tooltipBg,
        borderColor: colors.tooltipBorder,
        color: colors.tooltipText,
      }}
    >
      <p className="mb-2 text-[10px] uppercase tracking-wider text-muted">{formatChartDate(String(label))}</p>
      {rate != null ? (
        <p className="mb-1 tabular-nums">
          <span className="text-cipher-cyan font-bold">{rate.toFixed(2)}%</span>
          <span className="text-muted"> shielded</span>
        </p>
      ) : null}
      <p className="tabular-nums text-secondary">{formatZecCompact(shielded)} ZEC in pools</p>
      <p className="tabular-nums text-muted">{formatZecCompact(transparent)} ZEC transparent</p>
      {total > 0 ? (
        <p className="mt-1 pt-1 border-t border-glass-6 tabular-nums text-muted">
          {formatZecCompact(total)} ZEC tracked
        </p>
      ) : null}
    </div>
  );
}

export function PoolDistributionChart() {
  const { theme } = useTheme();
  const colors = getChartColors(theme);
  const [period, setPeriod] = useState<Period>('1y');
  const [view, setView] = useState<View>('composition');
  const [points, setPoints] = useState<PoolPoint[]>([]);
  const [hasPerPoolHistory, setHasPerPoolHistory] = useState(false);
  const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`${getApiUrl()}/api/network/pool-history?period=${period}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.points) setPoints(data.points);
        setHasPerPoolHistory(!!data?.hasVerifiedPerPoolBreakdown);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [period]);

  const chartData = useMemo(
    () =>
      points.map((p) => ({
        ...p,
        dateLabel: formatChartDate(String(p.date)),
        shieldedPct: p.shieldedSupplyPct,
      })),
    [points],
  );

  const pctValues = chartData.map((d) => d.shieldedPct).filter((v): v is number => v != null && v > 0);
  const rateYMin = pctValues.length ? Math.max(0, Math.floor(Math.min(...pctValues) - 2)) : 0;
  const rateYMax = pctValues.length ? Math.min(100, Math.ceil(Math.max(...pctValues) + 2)) : 40;

  const maxSupplyZec = useMemo(() => {
    let max = 0;
    for (const p of chartData) {
      const total = (p.shielded || 0) + (p.transparent || 0);
      if (total > max) max = total;
    }
    return max * 1.05 || 1;
  }, [chartData]);

  const canShowPools =
    hasPerPoolHistory || points.some((p) => p.orchard > 0 || (p as PoolPoint).ironwood > 0);

  const viewOptions: { key: View; label: string }[] = [
    { key: 'composition', label: 'ZEC' },
    ...(canShowPools ? [{ key: 'pools' as View, label: 'Pools' }] : []),
    { key: 'rate', label: '%' },
  ];

  const meta = VIEW_META[view];
  const axisFill = colors.axis;

  return (
    <div className="space-y-3">
      <ChartCard
        title="SHIELDED_SUPPLY"
        height={360}
        watermarkSize="lg"
        controls={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="inline-flex gap-0 rounded-md bg-glass-3 p-0.5">
              {viewOptions.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setView(key)}
                  className={segmentedClass(view === key)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="inline-flex gap-0 rounded-md bg-glass-3 p-0.5">
              {(['30d', '90d', '1y', 'all'] as Period[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPeriod(p)}
                  className={segmentedClass(period === p)}
                >
                  {p.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        }
      >
        {loading ? (
          <div className="flex h-[360px] items-center justify-center">
            <div className="h-48 w-full max-w-lg skeleton-bg rounded animate-pulse mx-6" />
          </div>
        ) : chartData.length === 0 ? (
          <div className="flex h-[360px] items-center justify-center text-xs font-mono text-muted">
            No supply history for this range.
          </div>
        ) : view === 'pools' && canShowPools ? (
          <ResponsiveContainer width="100%" height={360}>
            <AreaChart data={chartData} margin={{ top: 8, right: 12, left: 4, bottom: 24 }}>
              <CartesianGrid strokeDasharray="2 6" stroke={colors.grid} opacity={0.5} />
              <XAxis
                dataKey="dateLabel"
                stroke={colors.axis}
                tick={{ fill: colors.axis, fontSize: 10 }}
                interval="preserveStartEnd"
                label={privacyXAxisTitle('Date', axisFill)}
              />
              <YAxis
                stroke={colors.axis}
                tick={{ fill: colors.axis, fontSize: 10 }}
                tickFormatter={(v) => formatZecCompact(v)}
                domain={[0, maxSupplyZec]}
                width={52}
                label={privacyYAxisLabel('ZEC in pools', axisFill)}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: colors.tooltipBg,
                  border: `1px solid ${colors.tooltipBorder}`,
                  borderRadius: '8px',
                }}
                formatter={(value, name) => [`${formatZecCompact(Number(value))} ZEC`, String(name)]}
              />
              <Legend
                wrapperStyle={{ fontSize: 11, cursor: 'pointer', paddingTop: 8 }}
                onClick={(data) => {
                  const key = String(data.dataKey ?? '');
                  if (!key) return;
                  setHiddenSeries((prev) => {
                    const next = new Set(prev);
                    if (next.has(key)) next.delete(key);
                    else next.add(key);
                    return next;
                  });
                }}
              />
              <Area type="monotone" dataKey="ironwood" stackId="1" stroke={colors.ironwood} fill={colors.ironwood} fillOpacity={0.65} name="Ironwood" hide={hiddenSeries.has('ironwood')} />
              <Area type="monotone" dataKey="orchard" stackId="1" stroke={colors.orchard} fill={colors.orchard} fillOpacity={0.6} name="Orchard" hide={hiddenSeries.has('orchard')} />
              <Area type="monotone" dataKey="sapling" stackId="1" stroke={colors.sapling} fill={colors.sapling} fillOpacity={0.6} name="Sapling" hide={hiddenSeries.has('sapling')} />
              <Area type="monotone" dataKey="sprout" stackId="1" stroke={colors.sprout} fill={colors.sprout} fillOpacity={0.5} name="Sprout" hide={hiddenSeries.has('sprout')} />
              <Area type="monotone" dataKey="transparent" stackId="1" stroke={colors.transparent} fill={colors.transparent} fillOpacity={0.35} name="Transparent" hide={hiddenSeries.has('transparent')} />
            </AreaChart>
          </ResponsiveContainer>
        ) : view === 'composition' ? (
          <ResponsiveContainer width="100%" height={360}>
            <AreaChart data={chartData} margin={{ top: 8, right: 12, left: 4, bottom: 24 }}>
              <CartesianGrid strokeDasharray="2 6" stroke={colors.grid} opacity={0.5} />
              <XAxis
                dataKey="dateLabel"
                stroke={colors.axis}
                tick={{ fill: colors.axis, fontSize: 10 }}
                interval="preserveStartEnd"
                label={privacyXAxisTitle('Date', axisFill)}
              />
              <YAxis
                stroke={colors.axis}
                tick={{ fill: colors.axis, fontSize: 10 }}
                tickFormatter={(v) => formatZecCompact(v)}
                domain={[0, maxSupplyZec]}
                width={52}
                label={privacyYAxisLabel('Chain supply (ZEC)', axisFill)}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: colors.tooltipBg,
                  border: `1px solid ${colors.tooltipBorder}`,
                  borderRadius: '8px',
                }}
                formatter={(value, name) => [
                  `${formatZecCompact(Number(value))} ZEC`,
                  name === 'shielded' ? 'Shielded' : 'Transparent',
                ]}
              />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
              <Area type="monotone" dataKey="shielded" stackId="1" stroke={colors.shielded} fill={colors.shielded} fillOpacity={0.55} name="Shielded" />
              <Area type="monotone" dataKey="transparent" stackId="1" stroke={colors.transparent} fill={colors.transparent} fillOpacity={0.35} name="Transparent" />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <ResponsiveContainer width="100%" height={360}>
            <LineChart data={chartData} margin={{ top: 8, right: 12, left: 8, bottom: 24 }}>
              <CartesianGrid strokeDasharray="2 6" stroke={colors.grid} opacity={0.5} />
              <XAxis
                dataKey="dateLabel"
                stroke={colors.axis}
                tick={{ fill: colors.axis, fontSize: 10 }}
                interval="preserveStartEnd"
                label={privacyXAxisTitle('Date', axisFill)}
              />
              <YAxis
                stroke={colors.axis}
                tick={{ fill: colors.axis, fontSize: 10 }}
                domain={[rateYMin, rateYMax]}
                tickFormatter={(v) => `${v}%`}
                width={48}
                label={privacyYAxisLabel('Shielded % of supply', axisFill)}
              />
              <Tooltip content={<RateTooltip colors={colors} />} />
              <Line
                type="monotone"
                dataKey="shieldedPct"
                stroke={colors.cyan ?? colors.shielded}
                strokeWidth={2.5}
                dot={false}
                name="Shielding rate"
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </ChartCard>
      <p className="text-xs leading-relaxed text-muted">{meta.description}</p>
    </div>
  );
}
