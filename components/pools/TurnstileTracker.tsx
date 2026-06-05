'use client';

import { useEffect, useState } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { getApiUrl } from '@/lib/api-config';
import { useTheme } from '@/contexts/ThemeContext';
import { getChartColors } from '@/lib/chart-theme';
import { getFlowColors, TURNSTILE_CATEGORY_LABELS } from '@/lib/flow-colors';
import { formatZecCompact } from '@/lib/format-numbers';
import { Card, CardBody } from '@/components/ui/Card';
import { PeriodPillTags } from '@/components/ui/PeriodPillTags';
import { ChartCard } from '@/components/network/ChartCard';
import { MetricWithTooltip } from '@/components/pools/MetricWithTooltip';
import { TurnstileLegend } from '@/components/pools/TurnstileLegend';

type TurnstilePeriod = 'nu6.2' | '30d' | '90d' | '1y' | 'all';

const PERIOD_SINCE: Record<TurnstilePeriod, string> = {
  'nu6.2': '2026-06-01',
  '30d': '',
  '90d': '',
  '1y': '',
  'all': '2018-10-28',
};

function getSinceDate(p: TurnstilePeriod): string {
  if (PERIOD_SINCE[p]) return PERIOD_SINCE[p];
  const d = new Date();
  if (p === '30d') d.setDate(d.getDate() - 30);
  else if (p === '90d') d.setDate(d.getDate() - 90);
  else if (p === '1y') d.setFullYear(d.getFullYear() - 1);
  return d.toISOString().split('T')[0];
}

interface TurnstileSummary {
  totalDeshielded: number;
  totalHeld: number;
  totalReshielded: number;
  totalExchange: number;
  totalTransferred: number;
  totalMoved: number;
  heldPercent: number;
  reshieldedPercent: number;
  exchangePercent: number;
  transferredPercent: number;
  movedPercent: number;
  txCount: number;
}

interface TurnstilePoint {
  date: string;
  deshielded: number;
  held: number;
  reshielded: number;
  exchange: number;
  transferred: number;
  dateLabel: string;
}

interface TurnstileTrackerProps {
  showCardHeader?: boolean;
}

const PERIOD_OPTIONS: { key: TurnstilePeriod; label: string }[] = [
  { key: 'nu6.2', label: 'Since NU6.2' },
  { key: '30d', label: '30D' },
  { key: '90d', label: '90D' },
  { key: '1y', label: '1Y' },
  { key: 'all', label: 'ALL' },
];

export function TurnstileTracker({ showCardHeader = false }: TurnstileTrackerProps) {
  const { theme } = useTheme();
  const colors = getChartColors(theme);
  const flowColors = getFlowColors(theme);
  const [period, setPeriod] = useState<TurnstilePeriod>('nu6.2');
  const [summary, setSummary] = useState<TurnstileSummary | null>(null);
  const [timeseries, setTimeseries] = useState<TurnstilePoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const since = getSinceDate(period);
    fetch(`${getApiUrl()}/api/pools/turnstile?since=${since}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.summary) setSummary(data.summary);
        if (data?.timeseries) {
          setTimeseries(data.timeseries.map((p: TurnstilePoint) => ({
            ...p,
            dateLabel: new Date(p.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          })));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [period]);

  return (
    <div className="space-y-4">
      <Card variant="glass">
        <CardBody>
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
            {showCardHeader && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted font-mono uppercase tracking-widest opacity-50">{'>'}</span>
                <h2 className="text-sm font-bold font-mono text-secondary uppercase tracking-wider">TURNSTILE_TRACKER</h2>
              </div>
            )}
            <PeriodPillTags
              options={PERIOD_OPTIONS}
              value={period}
              onChange={setPeriod}
              className="sm:ml-auto"
              aria-label="Turnstile time period"
            />
          </div>

          {loading ? (
            <div className="space-y-6">
              <div className="h-10 w-48 skeleton-bg rounded animate-pulse" />
              <div className="h-3 skeleton-bg rounded-full animate-pulse" />
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="h-24 skeleton-bg rounded-xl animate-pulse" />
                ))}
              </div>
            </div>
          ) : !summary ? (
            <div className="flex items-center justify-center h-32">
              <span className="text-xs text-muted font-mono">No turnstile data available</span>
            </div>
          ) : (
            <>
              <MetricWithTooltip
                className="mb-6"
                label="Total Deshielded"
                tooltip="ZEC that left a shielded pool to a transparent address in this period"
              >
                <div className="flex items-baseline gap-3 flex-wrap">
                  <span
                    className="text-3xl sm:text-4xl font-bold font-mono tabular-nums"
                    style={{ color: flowColors.deshielding }}
                  >
                    {formatZecCompact(summary.totalDeshielded)}
                  </span>
                  <span className="text-sm font-mono text-muted">ZEC</span>
                  <span className="text-xs font-mono text-muted">
                    across {summary.txCount.toLocaleString()} txs
                  </span>
                </div>
              </MetricWithTooltip>

              {summary.totalDeshielded > 0 && (
                <div className="mb-6">
                  <div className="h-3 rounded-full overflow-hidden flex mb-3" style={{ backgroundColor: 'var(--color-bg)' }}>
                    <div
                      className="transition-all duration-1000 rounded-l-full"
                      style={{ width: `${summary.heldPercent}%`, backgroundColor: flowColors.held, opacity: 0.75 }}
                    />
                    <div
                      className="transition-all duration-1000"
                      style={{ width: `${summary.reshieldedPercent}%`, backgroundColor: flowColors.reshielded, opacity: 0.7 }}
                    />
                    <div
                      className="transition-all duration-1000"
                      style={{ width: `${summary.transferredPercent}%`, backgroundColor: flowColors.transferred, opacity: 0.55 }}
                    />
                    <div
                      className="transition-all duration-1000 rounded-r-full"
                      style={{ width: `${summary.exchangePercent}%`, backgroundColor: flowColors.exchange, opacity: 0.65 }}
                    />
                  </div>
                  <TurnstileLegend />
                </div>
              )}

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="bg-glass-4 rounded-xl p-4 border-l-2" style={{ borderLeftColor: flowColors.held }}>
                  <MetricWithTooltip
                    label="Still Held"
                    tooltip="Deshielded ZEC still sitting on the original transparent address"
                  >
                    <p className="text-xl font-bold font-mono tabular-nums text-primary">
                      {formatZecCompact(summary.totalHeld)}
                    </p>
                  </MetricWithTooltip>
                  <p className="text-xs font-mono text-muted mt-1">
                    {summary.heldPercent.toFixed(1)}% of deshielded
                  </p>
                </div>

                <div className="bg-glass-4 rounded-xl p-4 border-l-2" style={{ borderLeftColor: flowColors.reshielded }}>
                  <MetricWithTooltip
                    label="Reshielded"
                    tooltip="ZEC that moved back into a shielded pool after deshielding"
                  >
                    <p className="text-xl font-bold font-mono tabular-nums" style={{ color: flowColors.reshielded }}>
                      {formatZecCompact(summary.totalReshielded)}
                    </p>
                  </MetricWithTooltip>
                  <p className="text-xs font-mono text-muted mt-1">
                    {summary.reshieldedPercent.toFixed(1)}% of deshielded
                  </p>
                </div>

                <div className="bg-glass-4 rounded-xl p-4 border-l-2" style={{ borderLeftColor: flowColors.transferred }}>
                  <MetricWithTooltip
                    label="Transferred"
                    tooltip="ZEC sent to another transparent address (not an exchange)"
                  >
                    <p className="text-xl font-bold font-mono tabular-nums text-primary">
                      {formatZecCompact(summary.totalTransferred)}
                    </p>
                  </MetricWithTooltip>
                  <p className="text-xs font-mono text-muted mt-1">
                    {summary.transferredPercent.toFixed(1)}% of deshielded
                  </p>
                </div>

                <div className="bg-glass-4 rounded-xl p-4 border-l-2" style={{ borderLeftColor: flowColors.exchange }}>
                  <MetricWithTooltip
                    label="To Exchange"
                    tooltip="ZEC sent to a labeled exchange deposit address"
                  >
                    <p className="text-xl font-bold font-mono tabular-nums" style={{ color: flowColors.exchange }}>
                      {formatZecCompact(summary.totalExchange)}
                    </p>
                  </MetricWithTooltip>
                  <p className="text-xs font-mono text-muted mt-1">
                    {summary.exchangePercent.toFixed(1)}% of deshielded
                  </p>
                </div>
              </div>
            </>
          )}

          <p className="text-xs text-secondary font-sans mt-6 leading-relaxed">
            Tracks what happens after ZEC leaves a shielded pool. Updated hourly.
          </p>
          {(period === 'all' || period === '1y') && (
            <p className="text-[10px] text-muted/60 font-mono mt-2 leading-relaxed italic">
              Note: cumulative volume — the same ZEC can be deshielded and reshielded multiple times, so totals may exceed circulating supply.
            </p>
          )}
        </CardBody>
      </Card>

      {timeseries.length > 1 && (
        <ChartCard title="DAILY_DESHIELDED_ZEC_BREAKDOWN" height={280}>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={timeseries}>
              <CartesianGrid strokeDasharray="2 6" stroke={colors.grid} opacity={0.5} />
              <XAxis
                dataKey="dateLabel"
                stroke={colors.axis}
                tick={{ fill: colors.axis, fontSize: 10 }}
                interval="preserveStartEnd"
              />
              <YAxis
                stroke={colors.axis}
                tick={{ fill: colors.axis, fontSize: 10 }}
                tickFormatter={v => formatZecCompact(v)}
                width={48}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: colors.tooltipBg,
                  border: `1px solid ${colors.tooltipBorder}`,
                  borderRadius: '8px',
                  fontSize: 12,
                }}
                formatter={(value: number, name: string) => {
                  const labels: Record<string, string> = {
                    held: TURNSTILE_CATEGORY_LABELS.held,
                    reshielded: TURNSTILE_CATEGORY_LABELS.reshielded,
                    transferred: TURNSTILE_CATEGORY_LABELS.transferred,
                    exchange: TURNSTILE_CATEGORY_LABELS.exchange,
                  };
                  return [`${Number(value).toFixed(2)} ZEC`, labels[name] || name];
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
              <Area type="monotone" dataKey="held" stackId="1" stroke={flowColors.held} fill={flowColors.held} fillOpacity={0.35} name={TURNSTILE_CATEGORY_LABELS.held} />
              <Area type="monotone" dataKey="reshielded" stackId="1" stroke={flowColors.reshielded} fill={flowColors.reshielded} fillOpacity={0.3} name={TURNSTILE_CATEGORY_LABELS.reshielded} />
              <Area type="monotone" dataKey="transferred" stackId="1" stroke={flowColors.transferred} fill={flowColors.transferred} fillOpacity={0.2} name={TURNSTILE_CATEGORY_LABELS.transferred} />
              <Area type="monotone" dataKey="exchange" stackId="1" stroke={flowColors.exchange} fill={flowColors.exchange} fillOpacity={0.25} name={TURNSTILE_CATEGORY_LABELS.exchange} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      )}
    </div>
  );
}
