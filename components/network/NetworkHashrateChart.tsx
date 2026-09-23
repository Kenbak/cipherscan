'use client';

import { useState } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { useTheme } from '@/contexts/ThemeContext';
import { getChartColors } from '@/lib/chart-theme';
import { formatHashrate } from '@/lib/format-numbers';
import { useApiQuery } from '@/hooks/useApiQuery';
import { hashrateChartPoints, type HashrateEstimate, type HashrateStats, type HashrateWindow } from '@/lib/hashrate';
import { ChartCard } from './ChartCard';

const PERIODS = ['30d', '90d', '1y', 'all'] as const;
type Period = typeof PERIODS[number];

interface HashrateHistoryResponse {
  window?: string;
  method?: string;
  points?: (HashrateEstimate & { date: string })[];
}

function HashratePeriodSelector({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  return (
    <div className="inline-flex gap-0 p-0.5 rounded-md bg-glass-3 flex-shrink-0">
      {PERIODS.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onChange(p)}
          className={`px-1.5 py-0.5 text-[10px] font-mono rounded transition whitespace-nowrap ${
            value === p
              ? 'bg-cipher-cyan/15 text-cipher-cyan font-bold'
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
 * Trailing-work estimates sampled daily at UTC midnight, plus the shared current snapshot.
 * Complements MiningMetricsChart, which shows short-range per-block solrate/difficulty —
 * this one is for spotting week-to-month-scale ramps (new fleets, pool migrations, etc).
 */
export function NetworkHashrateChart() {
  const { theme } = useTheme();
  const colors = getChartColors(theme);
  const [period, setPeriod] = useState<Period>('1y');
  const [window, setWindow] = useState<HashrateWindow>('24h');
  const stats = useApiQuery<HashrateStats>('/api/network/stats', undefined, { refreshInterval: 30_000 });

  const { data, loading } = useApiQuery<HashrateHistoryResponse>(
    '/api/network/hashrate-history',
    { period, window },
    { refreshInterval: 300_000, timeoutMs: 30_000 },
  );
  const snapshot = stats.data?.mining?.hashrateEstimate;
  const points = hashrateChartPoints(data, window, snapshot);
  const current = snapshot?.windows['24h'];
  const gradientId = 'network-hashrate-gradient';

  return (
    <ChartCard
      title="NETWORK_HASHRATE_TREND"
      height={320}
      watermarkSize="lg"
      controls={<div className="flex flex-wrap items-center gap-2">
        <label className="text-xs text-muted">Estimate window{' '}
          <select aria-label="Hashrate estimate window" value={window} onChange={event => setWindow(event.target.value as HashrateWindow)} className="bg-transparent text-primary">
            <option value="24h">24 hours</option><option value="7d">7 days</option>
          </select>
        </label>
        <HashratePeriodSelector value={period} onChange={setPeriod} />
      </div>}
    >
      <p className="text-xs font-mono text-muted mb-3">
        Estimated hashrate · 24h: <span className="text-cipher-cyan font-bold">{snapshot ? stats.data?.mining?.networkHashrate : '—'}</span>
        {current && <span className="block text-muted">{current.blockCount.toLocaleString()} blocks · As of {current.windowEnd.replace('T', ' ').replace('Z', ' UTC')}</span>}
      </p>
      <p className="text-xs text-muted mb-3">
        Canonical block work divided by the full trailing {window === '24h' ? '24 hours' : '7 days'}.
        Historical samples end at midnight UTC; the last point uses the current shared snapshot.
        Estimates use block-header timestamps and exclude orphaned blocks.
      </p>
      {(stats.error || stats.isRefreshing) && <p className="text-xs text-muted" role="status">{stats.error ? 'Live refresh delayed; showing the last available snapshot.' : 'Refreshing estimate…'}</p>}
      {!points.some(point => point.hashrate != null) ? (
        <div className="flex items-center justify-center h-[260px]">
          <div className="animate-pulse text-muted font-mono text-xs">{loading ? 'Loading…' : 'Hashrate history unavailable'}</div>
        </div>
      ) : (
        <ResponsiveContainer initialDimension={{ width: 500, height: 300 }} width="100%" height={260}>
          <AreaChart data={points}>
            <CartesianGrid strokeDasharray="2 6" stroke={colors.grid} opacity={0.5} />
            <XAxis
              dataKey="timestamp"
              type="number"
              scale="time"
              domain={['dataMin', 'dataMax']}
              stroke={colors.axis}
              tick={{ fill: colors.axis, fontSize: 10 }}
              tickFormatter={(d: number) => {
                const date = new Date(d);
                return `${date.getUTCMonth() + 1}/${date.getUTCDate()}`;
              }}
            />
            <YAxis
              stroke={colors.axis}
              tick={{ fill: colors.axis, fontSize: 10 }}
              tickFormatter={(v: number) => formatHashrate(v)}
              width={68}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: colors.tooltipBg,
                border: `1px solid ${colors.tooltipBorder}`,
                borderRadius: 8,
                fontSize: 11,
                fontFamily: 'monospace',
              }}
              labelFormatter={(d) => `${new Date(Number(d)).toISOString().replace('T', ' ').replace('Z', '')} UTC`}
              formatter={(value) => [formatHashrate(Number(value)), `Estimated hashrate · ${window}`]}
            />
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={colors.cyan} stopOpacity={0.3} />
                <stop offset="100%" stopColor={colors.cyan} stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area
              type="linear"
              connectNulls={false}
              dataKey="hashrate"
              stroke={colors.cyan}
              strokeWidth={2}
              fill={`url(#${gradientId})`}
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}
