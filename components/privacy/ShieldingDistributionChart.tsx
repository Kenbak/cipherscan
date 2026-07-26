'use client';

import { useEffect, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { getApiUrl } from '@/lib/api-config';
import { useTheme } from '@/contexts/ThemeContext';
import { getChartColors } from '@/lib/chart-theme';
import { ChartCard } from '@/components/network/ChartCard';
import { PeriodSelector, Period } from './PeriodSelector';
import {
  PRIVACY_BAR_CHART_MARGIN,
  privacyXAxisTitle,
  privacyYAxisLabel,
} from './privacy-chart-axis';
import { PrivacyBarLegend } from './PrivacyBarLegend';

interface Bucket {
  label: string;
  minZat: number;
  maxZat: number | null;
  shieldCount: number;
  deshieldCount: number;
  shieldVolumeZat: number;
  deshieldVolumeZat: number;
}

type ViewMode = 'count' | 'volume';

const CHART_HEIGHT = 340;

function modePillClass(active: boolean) {
  return `px-1.5 py-0.5 text-[10px] font-mono rounded transition-all whitespace-nowrap ${
    active
      ? 'bg-cipher-cyan/15 text-cipher-cyan font-bold'
      : 'text-muted hover:text-primary'
  }`;
}

export function ShieldingDistributionChart() {
  const { theme } = useTheme();
  const colors = getChartColors(theme);
  const [period, setPeriod] = useState<Period>('30d');
  const [mode, setMode] = useState<ViewMode>('count');
  const [data, setData] = useState<Bucket[]>([]);
  const [loading, setLoading] = useState(true);
  const yLabel = mode === 'count' ? 'Transactions' : 'ZEC volume';

  useEffect(() => {
    setLoading(true);
    fetch(`${getApiUrl()}/api/analytics/shielding-distribution?period=${period}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => {
        if (res?.buckets) setData(res.buckets);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [period]);

  const chartData = data.map((b) => ({
    label: `${b.label} ZEC`,
    shield: mode === 'count' ? b.shieldCount : b.shieldVolumeZat / 1e8,
    deshield: mode === 'count' ? b.deshieldCount : b.deshieldVolumeZat / 1e8,
  }));

  const controls = (
    <div className="flex items-center gap-2">
      <div className="inline-flex flex-shrink-0 gap-0 rounded-md bg-glass-3 p-0.5">
        {(['count', 'volume'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={modePillClass(mode === m)}
          >
            {m === 'count' ? 'COUNT' : 'VOLUME'}
          </button>
        ))}
      </div>
      <PeriodSelector value={period} onChange={setPeriod} />
    </div>
  );

  const tooltipStyle = {
    backgroundColor: colors.tooltipBg,
    border: `1px solid ${colors.tooltipBorder}`,
    borderRadius: '8px',
    padding: '12px',
    color: colors.tooltipText,
  };

  return (
    <ChartCard title="Shielding distribution" height={400} controls={controls}>
      {loading ? (
        <div className="flex h-[340px] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-cipher-cyan/30 border-t-cipher-cyan" />
        </div>
      ) : (
        <div>
          <p className="mb-3 text-xs leading-relaxed text-muted">
            {mode === 'count'
              ? `Transaction count by amount range (${period === 'all' ? 'all time' : `last ${period}`}). Larger buckets mean more potential cover traffic.`
              : `ZEC volume by amount range (${period === 'all' ? 'all time' : `last ${period}`}). Shows where value concentrates across shielded flows.`}
          </p>
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <BarChart data={chartData} margin={PRIVACY_BAR_CHART_MARGIN}>
              <CartesianGrid strokeDasharray="2 6" stroke={colors.gridStroke} />
              <XAxis
                dataKey="label"
                tick={{ fill: colors.axis, fontSize: 9 }}
                angle={-35}
                textAnchor="end"
                height={72}
                interval={0}
                label={privacyXAxisTitle('Amount range', colors.axis)}
              />
              <YAxis
                tick={{ fill: colors.axis, fontSize: 11 }}
                tickFormatter={(v) => (mode === 'count' ? formatCount(v) : formatZec(v))}
                width={52}
                label={privacyYAxisLabel(yLabel, colors.axis)}
              />
              <Tooltip
                cursor={{ fill: colors.barCursorCyan }}
                contentStyle={tooltipStyle}
                labelStyle={{ color: colors.tooltipText, fontWeight: 'bold', marginBottom: '8px' }}
                formatter={(value, name) => [
                  mode === 'count'
                    ? `${Number(value).toLocaleString()} txs`
                    : `${Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })} ZEC`,
                  String(name) === 'shield' ? 'Shield (in)' : 'Deshield (out)',
                ]}
              />
              <Bar dataKey="shield" fill={colors.cyan} name="shield" radius={[3, 3, 0, 0]} />
              <Bar dataKey="deshield" fill={colors.transparent} name="deshield" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <PrivacyBarLegend shieldColor={colors.cyan} deshieldColor={colors.transparent} />
        </div>
      )}
    </ChartCard>
  );
}

function formatCount(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
  return `${n}`;
}

function formatZec(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
  return n.toFixed(0);
}
