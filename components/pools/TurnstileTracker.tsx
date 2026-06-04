'use client';

import { useEffect, useState } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { getApiUrl } from '@/lib/api-config';
import { useTheme } from '@/contexts/ThemeContext';
import { getChartColors } from '@/lib/chart-theme';
import { formatZecCompact } from '@/lib/format-numbers';
import { Card, CardBody } from '@/components/ui/Card';
import { ChartCard } from '@/components/network/ChartCard';

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

export function TurnstileTracker() {
  const { theme } = useTheme();
  const colors = getChartColors(theme);
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

  const deshieldColor = theme === 'dark' ? '#E8C48D' : '#c9a066';
  const heldColor = colors.cyan;
  const reshieldedColor = '#6BCB77';
  const exchangeColor = theme === 'dark' ? '#E8C48D' : '#c9a066';
  const transferredColor = colors.transparent;

  const periodOptions: { key: TurnstilePeriod; label: string }[] = [
    { key: 'nu6.2', label: 'Since NU6.2' },
    { key: '30d', label: '30D' },
    { key: '90d', label: '90D' },
    { key: '1y', label: '1Y' },
    { key: 'all', label: 'ALL' },
  ];

  return (
    <div className="space-y-4">
      <Card variant="glass">
        <CardBody>
          <div className="flex items-center justify-between gap-3 mb-6">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted font-mono uppercase tracking-widest opacity-50">{'>'}</span>
              <h2 className="text-sm font-bold font-mono text-secondary uppercase tracking-wider">TURNSTILE_TRACKER</h2>
            </div>
            <div className="flex gap-1 flex-wrap justify-end">
              {periodOptions.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setPeriod(key)}
                  className={`px-2 py-1 text-[10px] font-mono rounded ${
                    period === key
                      ? 'bg-cipher-cyan/10 text-cipher-cyan border border-cipher-cyan/30'
                      : 'text-muted'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-32">
              <span className="text-xs text-muted font-mono">Loading turnstile data...</span>
            </div>
          ) : !summary ? (
            <div className="flex items-center justify-center h-32">
              <span className="text-xs text-muted font-mono">No turnstile data available</span>
            </div>
          ) : (
            <>
              {/* Hero stat: Total Deshielded */}
              <div className="px-4 mb-5">
                <p className="text-[10px] font-mono uppercase tracking-wider text-muted mb-1">Total Deshielded</p>
                <div className="flex items-baseline gap-3">
                  <span className="text-3xl sm:text-4xl font-bold font-mono tabular-nums" style={{ color: deshieldColor }}>
                    {formatZecCompact(summary.totalDeshielded)}
                  </span>
                  <span className="text-sm font-mono text-muted">ZEC</span>
                  <span className="text-[10px] font-mono text-muted">across {summary.txCount.toLocaleString()} txs</span>
                </div>
              </div>

              {/* 4-segment composition bar */}
              {summary.totalDeshielded > 0 && (
                <div className="mx-4 mb-5">
                  <div className="h-3 rounded-full overflow-hidden flex" style={{ backgroundColor: 'var(--color-bg)' }}>
                    <div className="transition-all duration-1000 rounded-l-full" style={{ width: `${summary.heldPercent}%`, backgroundColor: heldColor, opacity: 0.7 }} />
                    <div className="transition-all duration-1000" style={{ width: `${summary.reshieldedPercent}%`, backgroundColor: reshieldedColor, opacity: 0.6 }} />
                    <div className="transition-all duration-1000" style={{ width: `${summary.transferredPercent}%`, backgroundColor: transferredColor, opacity: 0.35 }} />
                    <div className="transition-all duration-1000 rounded-r-full" style={{ width: `${summary.exchangePercent}%`, backgroundColor: exchangeColor, opacity: 0.5 }} />
                  </div>
                </div>
              )}

              {/* 4 stat cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 px-4">
                <div className="bg-glass-4 rounded-xl p-4 border-l-2" style={{ borderLeftColor: heldColor }}>
                  <p className="text-[10px] font-mono uppercase tracking-wider text-muted mb-1">Still Held</p>
                  <p className="text-xl font-bold font-mono tabular-nums text-cipher-cyan">{formatZecCompact(summary.totalHeld)}</p>
                  <p className="text-[10px] font-mono text-muted mt-0.5">
                    {summary.heldPercent.toFixed(1)}% <span className="opacity-60">— sitting at t-addr</span>
                  </p>
                </div>

                <div className="bg-glass-4 rounded-xl p-4 border-l-2" style={{ borderLeftColor: reshieldedColor }}>
                  <p className="text-[10px] font-mono uppercase tracking-wider text-muted mb-1">Reshielded</p>
                  <p className="text-xl font-bold font-mono tabular-nums" style={{ color: reshieldedColor }}>{formatZecCompact(summary.totalReshielded)}</p>
                  <p className="text-[10px] font-mono text-muted mt-0.5">
                    {summary.reshieldedPercent.toFixed(1)}% <span className="opacity-60">— back to privacy</span>
                  </p>
                </div>

                <div className="bg-glass-4 rounded-xl p-4 border-l-2" style={{ borderLeftColor: transferredColor }}>
                  <p className="text-[10px] font-mono uppercase tracking-wider text-muted mb-1">Transferred</p>
                  <p className="text-xl font-bold font-mono tabular-nums text-muted">{formatZecCompact(summary.totalTransferred)}</p>
                  <p className="text-[10px] font-mono text-muted mt-0.5">
                    {summary.transferredPercent.toFixed(1)}% <span className="opacity-60">— to another t-addr</span>
                  </p>
                </div>

                <div className="bg-glass-4 rounded-xl p-4 border-l-2" style={{ borderLeftColor: exchangeColor }}>
                  <p className="text-[10px] font-mono uppercase tracking-wider text-muted mb-1">To Exchange</p>
                  <p className="text-xl font-bold font-mono tabular-nums" style={{ color: exchangeColor }}>{formatZecCompact(summary.totalExchange)}</p>
                  <p className="text-[10px] font-mono text-muted mt-0.5">
                    {summary.exchangePercent.toFixed(1)}% <span className="opacity-60">— labeled exchange addr</span>
                  </p>
                </div>
              </div>
            </>
          )}

          <p className="text-[10px] text-muted font-mono mt-4 mx-4 leading-relaxed">
            Tracks what happens after ZEC leaves a shielded pool. &quot;Reshielded&quot; = went back into a private pool.
            &quot;To Exchange&quot; = sent to a labeled exchange address. &quot;Transferred&quot; = moved to another transparent address. Updated hourly.
          </p>
          {(period === 'all' || period === '1y') && (
            <p className="text-[10px] text-muted/60 font-mono mt-1 mx-4 leading-relaxed italic">
              Note: cumulative volume — the same ZEC can be deshielded and reshielded multiple times, so totals may exceed circulating supply.
            </p>
          )}
        </CardBody>
      </Card>

      {/* Time series chart */}
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
                    held: 'Still Held',
                    reshielded: 'Reshielded',
                    transferred: 'Transferred',
                    exchange: 'To Exchange',
                  };
                  return [`${Number(value).toFixed(2)} ZEC`, labels[name] || name];
                }}
              />
              <Area type="monotone" dataKey="held" stackId="1" stroke={heldColor} fill={heldColor} fillOpacity={0.35} name="held" />
              <Area type="monotone" dataKey="reshielded" stackId="1" stroke={reshieldedColor} fill={reshieldedColor} fillOpacity={0.3} name="reshielded" />
              <Area type="monotone" dataKey="transferred" stackId="1" stroke={transferredColor} fill={transferredColor} fillOpacity={0.15} name="transferred" />
              <Area type="monotone" dataKey="exchange" stackId="1" stroke={exchangeColor} fill={exchangeColor} fillOpacity={0.25} name="exchange" />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      )}
    </div>
  );
}
