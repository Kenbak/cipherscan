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
import { CURRENCY } from '@/lib/config';
import { ChartCard } from '@/components/network/ChartCard';
import { PeriodSelector, Period } from './PeriodSelector';
import {
  PRIVACY_BAR_CHART_MARGIN,
  privacyXAxisTitle,
  privacyYAxisLabel,
} from './privacy-chart-axis';
import { PrivacyBarLegend } from './PrivacyBarLegend';

interface Threshold {
  thresholdZat: number;
  thresholdZec: number;
  shieldCount: number;
  deshieldCount: number;
}

const CHART_HEIGHT = 340;

export function AnonymitySetChart() {
  const { theme } = useTheme();
  const colors = getChartColors(theme);
  const [period, setPeriod] = useState<Period>('30d');
  const [data, setData] = useState<Threshold[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`${getApiUrl()}/api/analytics/anonymity-set?period=${period}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => {
        if (res?.thresholds) setData(res.thresholds);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [period]);

  const chartData = data.map((t) => ({
    label: formatZec(t.thresholdZec),
    shield: t.shieldCount,
    deshield: t.deshieldCount,
    total: t.shieldCount + t.deshieldCount,
  }));

  const tooltipStyle = {
    backgroundColor: colors.tooltipBg,
    border: `1px solid ${colors.tooltipBorder}`,
    borderRadius: '8px',
    padding: '12px',
    color: colors.tooltipText,
  };

  return (
    <ChartCard
      title="Anonymity set"
      height={400}
      controls={<PeriodSelector value={period} onChange={setPeriod} />}
    >
      {loading ? (
        <div className="flex h-[340px] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-cipher-cyan/30 border-t-cipher-cyan" />
        </div>
      ) : (
        <div>
          <p className="mb-3 text-xs leading-relaxed text-muted">
            How many transactions in the {period === 'all' ? 'full history' : `last ${period}`} could
            be <em>your</em> source at each {CURRENCY} threshold? Higher counts mean a larger crowd
            to hide in.
          </p>
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <BarChart data={chartData} margin={PRIVACY_BAR_CHART_MARGIN}>
              <CartesianGrid strokeDasharray="2 6" stroke={colors.gridStroke} />
              <XAxis
                dataKey="label"
                tick={{ fill: colors.axis, fontSize: 10 }}
                angle={-35}
                textAnchor="end"
                height={64}
                interval={0}
                label={privacyXAxisTitle(`${CURRENCY} threshold`, colors.axis)}
              />
              <YAxis
                tick={{ fill: colors.axis, fontSize: 11 }}
                tickFormatter={formatCount}
                width={52}
                label={privacyYAxisLabel('Transactions', colors.axis)}
              />
              <Tooltip
                cursor={{ fill: colors.barCursorCyan }}
                contentStyle={tooltipStyle}
                labelStyle={{ color: colors.tooltipText, fontWeight: 'bold', marginBottom: '8px' }}
                formatter={(value, name) => [
                  `${Number(value).toLocaleString()} txs`,
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

function formatZec(zec: number): string {
  if (zec >= 1000) return `${(zec / 1000).toFixed(0)}K`;
  if (zec >= 1) return `${zec}`;
  if (zec >= 0.01) return `${zec}`;
  return `${zec}`;
}

function formatCount(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
  return `${n}`;
}
