'use client';

import { useEffect, useState } from 'react';
import {
  AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { getApiUrl } from '@/lib/api-config';
import { useTheme } from '@/contexts/ThemeContext';
import { getChartColors } from '@/lib/chart-theme';
import { ChartCard } from './ChartCard';

const PERIODS = ['7d', '30d', '90d', '1y'] as const;
type Period = typeof PERIODS[number];

interface DayFees {
  date: string;
  p10: number;
  p25: number;
  median: number;
  p75: number;
  p90: number;
  avgFee: number;
  txCount: number;
}

export function FeeDistributionChart() {
  const { theme } = useTheme();
  const colors = getChartColors(theme);
  const [period, setPeriod] = useState<Period>('30d');
  const [data, setData] = useState<DayFees[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`${getApiUrl()}/api/network/fee-distribution?period=${period}`)
      .then(r => r.ok ? r.json() : null)
      .then(res => {
        if (res?.daily) setData(res.daily);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [period]);

  const chartData = data.map(d => ({
    date: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    p10: d.p10 / 100000,
    p25: d.p25 / 100000,
    median: d.median / 100000,
    p75: d.p75 / 100000,
    p90: d.p90 / 100000,
    txCount: d.txCount,
  }));

  const periodSelector = (
    <div className="inline-flex gap-0 p-0.5 rounded-md bg-glass-3 flex-shrink-0">
      {PERIODS.map(p => (
        <button
          key={p}
          onClick={() => setPeriod(p)}
          className={`px-1.5 py-0.5 text-[10px] font-mono rounded transition-all whitespace-nowrap ${
            period === p
              ? 'bg-cipher-cyan/15 text-cipher-cyan font-bold'
              : 'text-muted hover:text-primary'
          }`}
        >
          {p.toUpperCase()}
        </button>
      ))}
    </div>
  );

  return (
    <ChartCard
      title="FEE_DISTRIBUTION"
      height={340}
      controls={periodSelector}
    >
      {loading ? (
        <div className="flex items-center justify-center h-[340px]">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-cipher-cyan border-t-transparent" />
        </div>
      ) : (
        <div>
          <p className="text-xs text-muted mb-3 leading-relaxed">
            Daily fee percentiles (in mZEC, 1 mZEC = 100,000 zatoshis). The band shows the
            10th–90th percentile range; the line is the median. Narrow bands mean consensus on fee levels.
          </p>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <defs>
                <linearGradient id="feeBand" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={colors.cyan} stopOpacity={0.2} />
                  <stop offset="95%" stopColor={colors.cyan} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="2 6" stroke={colors.grid} opacity={0.5} />
              <XAxis
                dataKey="date"
                stroke={colors.axis}
                tick={{ fill: colors.axis, fontSize: 10 }}
                angle={-35}
                textAnchor="end"
                height={50}
              />
              <YAxis
                stroke={colors.axis}
                tick={{ fill: colors.axis, fontSize: 11 }}
                tickFormatter={(v) => `${v.toFixed(2)}`}
                label={{ value: 'mZEC', angle: -90, position: 'insideLeft', fill: colors.axis, style: { fontSize: 10 } }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: colors.tooltipBg,
                  border: `1px solid ${colors.tooltipBorder}`,
                  borderRadius: '8px',
                  color: colors.tooltipText,
                }}
                formatter={(value, name) => {
                  const labels: Record<string, string> = {
                    p90: '90th percentile',
                    p75: '75th percentile',
                    median: 'Median',
                    p25: '25th percentile',
                    p10: '10th percentile',
                  };
                  return [`${Number(value).toFixed(3)} mZEC`, labels[String(name)] || String(name)];
                }}
              />
              <Legend
                formatter={(value) => {
                  const labels: Record<string, string> = {
                    p90: 'P90',
                    p75: 'P75',
                    median: 'Median',
                    p25: 'P25',
                    p10: 'P10',
                  };
                  return (
                    <span style={{ color: colors.tooltipText, fontSize: 11 }}>
                      {labels[value] || value}
                    </span>
                  );
                }}
              />
              <Area
                type="monotone"
                dataKey="p90"
                stroke={colors.cyan}
                strokeWidth={1}
                strokeDasharray="3 3"
                fill="url(#feeBand)"
                name="p90"
              />
              <Area
                type="monotone"
                dataKey="p75"
                stroke={colors.cyan}
                strokeWidth={1}
                strokeOpacity={0.6}
                fill="none"
                name="p75"
              />
              <Area
                type="monotone"
                dataKey="median"
                stroke={colors.purple}
                strokeWidth={2.5}
                fill="none"
                name="median"
              />
              <Area
                type="monotone"
                dataKey="p25"
                stroke={colors.cyan}
                strokeWidth={1}
                strokeOpacity={0.6}
                fill="none"
                name="p25"
              />
              <Area
                type="monotone"
                dataKey="p10"
                stroke={colors.cyan}
                strokeWidth={1}
                strokeDasharray="3 3"
                fill="none"
                name="p10"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartCard>
  );
}
