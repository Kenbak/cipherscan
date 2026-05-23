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

type Period = '30d' | '90d' | '1y';
type View = 'composition' | 'share';

const MAX_ZEC_SUPPLY = 21_000_000;

interface PoolPoint {
  date: string;
  shielded: number;
  transparent: number;
  shieldedSupplyPct: number | null;
}

export function PoolDistributionChart() {
  const { theme } = useTheme();
  const colors = getChartColors(theme);
  const [period, setPeriod] = useState<Period>('1y');
  const [view, setView] = useState<View>('composition');
  const [points, setPoints] = useState<PoolPoint[]>([]);

  useEffect(() => {
    fetch(`${getApiUrl()}/api/network/pool-history?period=${period}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.points) {
          setPoints(
            data.points.map((p: PoolPoint & { orchard?: number }) => ({
              date: p.date,
              shielded: p.shielded,
              transparent: p.transparent,
              shieldedSupplyPct: p.shieldedSupplyPct,
            }))
          );
        }
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

  return (
    <div className="space-y-3">
      <ChartCard
        title="SHIELDED_SUPPLY"
        height={320}
        watermarkSize="lg"
        controls={
          <div className="flex flex-wrap gap-1 justify-end">
            <div className="flex gap-1 mr-2">
              {([
                { key: 'composition', label: 'ZEC' },
                { key: 'share', label: '%' },
              ] as const).map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setView(key)}
                  className={`px-2 py-1 text-[10px] font-mono rounded ${
                    view === key ? 'bg-cipher-purple/10 text-cipher-purple border border-cipher-purple/30' : 'text-muted'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
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
          {view === 'composition' ? (
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
              <ReferenceLine
                y={MAX_ZEC_SUPPLY}
                stroke={colors.axis}
                strokeDasharray="4 4"
                strokeOpacity={0.35}
              />
              <Tooltip
                contentStyle={{ backgroundColor: colors.tooltipBg, border: `1px solid ${colors.tooltipBorder}`, borderRadius: '8px' }}
                formatter={(value: number, name: string) => [`${(value / 1e6).toFixed(3)}M ZEC`, name]}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area type="monotone" dataKey="shielded" stackId="1" stroke={colors.shielded} fill={colors.shielded} fillOpacity={0.55} name="Shielded" />
              <Area type="monotone" dataKey="transparent" stackId="1" stroke={colors.transparent} fill={colors.transparent} fillOpacity={0.35} name="Transparent" />
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
        Shielded vs transparent supply (historical daily totals). Sprout/Sapling/Orchard split is in the live supply panel above — we don&apos;t store per-pool history yet.
      </p>
    </div>
  );
}
