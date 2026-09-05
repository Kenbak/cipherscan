'use client';

import { useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { useTheme } from '@/contexts/ThemeContext';
import { getChartColors } from '@/lib/chart-theme';
import { formatHashrate } from '@/lib/format-numbers';
import { useApiQuery } from '@/hooks/useApiQuery';
import { ChartCard } from './ChartCard';

const PERIODS = ['30d', '90d', '1y', 'all'] as const;
type Period = typeof PERIODS[number];

interface HashratePoint {
  date: string;
  avgDifficulty: number;
  blockCount: number;
  hashrate: number;
}

interface HashrateHistoryResponse {
  points?: HashratePoint[];
}

function HashratePeriodSelector({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  return (
    <div className="inline-flex gap-0 p-0.5 rounded-md bg-glass-3 flex-shrink-0">
      {PERIODS.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onChange(p)}
          className={`px-1.5 py-0.5 text-caption font-mono rounded transition whitespace-nowrap ${
            value === p
              ? 'bg-brand-gold/15 text-cipher-gold font-semibold'
              : 'text-muted hover:text-primary'
          }`}
        >
          {p.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

/**
 * Long-range network hashrate trend (daily buckets from /api/network/hashrate-history).
 * Complements MiningMetricsChart, which shows short-range per-block solrate/difficulty —
 * this one is for spotting week-to-month-scale ramps (new fleets, pool migrations, etc).
 */
export function NetworkHashrateChart() {
  const { theme } = useTheme();
  const colors = getChartColors(theme);
  const [period, setPeriod] = useState<Period>('1y');

  const { data, loading } = useApiQuery<HashrateHistoryResponse>(
    '/api/network/hashrate-history',
    { period },
  );
  const points = data?.points ?? [];
  const latest = points[points.length - 1];

  return (
    <ChartCard
      title="NETWORK_HASHRATE_TREND"
      height={280}
      watermarkSize="lg"
      controls={<HashratePeriodSelector value={period} onChange={setPeriod} />}
    >
      {latest && (
        <p className="text-xs font-mono text-muted mb-3">
          Latest: <span className="text-cipher-gold font-semibold">{formatHashrate(latest.hashrate)}</span>
          <span className="text-muted"> ({latest.date}, {latest.blockCount} blocks)</span>
        </p>
      )}
      {loading && points.length === 0 ? (
        <div className="flex items-center justify-center h-[260px]">
          <div className="animate-pulse text-muted font-mono text-xs">Loading...</div>
        </div>
      ) : (
        <ResponsiveContainer initialDimension={{ width: 500, height: 300 }} width="100%" height={260}>
          <LineChart data={points} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} strokeDasharray="2 6" stroke={colors.grid} opacity={0.5} />
            <XAxis
              dataKey="date"
              minTickGap={32}
              stroke={colors.axis}
              tick={{ fill: colors.axis, fontSize: 12 }}
              tickFormatter={(d: string) => {
                const date = new Date(d);
                return `${date.getMonth() + 1}/${date.getDate()}`;
              }}
            />
            <YAxis
              stroke={colors.axis}
              tick={{ fill: colors.axis, fontSize: 12 }}
              tickFormatter={(v: number) => formatHashrate(v)}
              width={100}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: colors.tooltipBg,
                border: `1px solid ${colors.tooltipBorder}`,
                borderRadius: 8,
                fontSize: 12,
                fontFamily: 'var(--font-geist-mono), monospace',
              }}
              labelFormatter={(d) => String(d)}
              formatter={(value) => [formatHashrate(Number(value)), 'Network hashrate']}
            />
            <Line
              type="linear"
              dataKey="hashrate"
              stroke={colors.gold}
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}
