'use client';

import { useEffect, useState } from 'react';
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { getApiUrl } from '@/lib/api-config';
import { useTheme } from '@/contexts/ThemeContext';
import { getChartColors } from '@/lib/chart-theme';
import { ChartCard } from '@/components/network/ChartCard';
import { PeriodSelector, Period } from './PeriodSelector';

interface Threshold {
  thresholdZat: number;
  thresholdZec: number;
  shieldCount: number;
  deshieldCount: number;
}

export function AnonymitySetChart() {
  const { theme } = useTheme();
  const colors = getChartColors(theme);
  const [period, setPeriod] = useState<Period>('30d');
  const [data, setData] = useState<Threshold[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`${getApiUrl()}/api/analytics/anonymity-set?period=${period}`)
      .then(r => r.ok ? r.json() : null)
      .then(res => {
        if (res?.thresholds) setData(res.thresholds);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [period]);

  const chartData = data.map(t => ({
    label: formatZec(t.thresholdZec),
    shield: t.shieldCount,
    deshield: t.deshieldCount,
    total: t.shieldCount + t.deshieldCount,
  }));

  return (
    <ChartCard
      title="ANONYMITY_SET"
      height={340}
      controls={<PeriodSelector value={period} onChange={setPeriod} />}
    >
      {loading ? (
        <div className="flex items-center justify-center h-[340px]">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-cipher-purple border-t-transparent" />
        </div>
      ) : (
        <div>
          <p className="text-xs text-muted mb-3 leading-relaxed">
            How many transactions in the {period === 'all' ? 'full history' : `last ${period}`} could
            be <em>your</em> source at each ZEC threshold? Higher = better privacy. The shielded pool
            hides your transaction among all others at or above the same amount.
          </p>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="2 6" stroke={colors.grid} opacity={0.5} />
              <XAxis
                dataKey="label"
                stroke={colors.axis}
                tick={{ fill: colors.axis, fontSize: 10 }}
                angle={-35}
                textAnchor="end"
                height={50}
              />
              <YAxis
                stroke={colors.axis}
                tick={{ fill: colors.axis, fontSize: 11 }}
                tickFormatter={formatCount}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: colors.tooltipBg,
                  border: `1px solid ${colors.tooltipBorder}`,
                  borderRadius: '8px',
                  color: colors.tooltipText,
                }}
                formatter={(value: number, name: string) => [
                  value.toLocaleString() + ' txs',
                  name === 'shield' ? 'Shield (in)' : 'Deshield (out)',
                ]}
              />
              <Legend
                formatter={(value) => (
                  <span style={{ color: colors.tooltipText, fontSize: 11 }}>
                    {value === 'shield' ? 'Shield (in)' : 'Deshield (out)'}
                  </span>
                )}
              />
              <Bar dataKey="shield" fill={colors.purple} name="shield" radius={[3, 3, 0, 0]} />
              <Bar dataKey="deshield" fill={colors.cyan} name="deshield" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
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
