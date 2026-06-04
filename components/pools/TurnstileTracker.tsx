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
  totalMoved: number;
  heldPercent: number;
  movedPercent: number;
  txCount: number;
}

interface TurnstilePoint {
  date: string;
  deshielded: number;
  held: number;
  moved: number;
  dateLabel: string;
}

export function TurnstileTracker() {
  const { theme } = useTheme();
  const colors = getChartColors(theme);
  const [period, setPeriod] = useState<TurnstilePeriod>('30d');
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
  const movedColor = colors.transparent;

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
            <div className="flex gap-1">
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
              {/* Flow stats — 3 connected blocks */}
              <div className="relative grid grid-cols-1 sm:grid-cols-3 gap-0">
                {/* Connecting gradient line */}
                <div className="hidden sm:block absolute top-1/2 left-0 right-0 h-px -translate-y-1/2 z-0"
                  style={{
                    background: `linear-gradient(to right, ${deshieldColor}40, ${heldColor}40, ${movedColor}40)`,
                  }}
                />

                {/* Total Deshielded */}
                <div className="relative z-10 p-4 text-center sm:text-left">
                  <div className="bg-glass-4 rounded-xl p-5 border border-glass-6">
                    <p className="text-[10px] font-mono uppercase tracking-wider text-muted mb-2">Total Deshielded</p>
                    <p className="text-2xl sm:text-3xl font-bold font-mono tabular-nums" style={{ color: deshieldColor }}>
                      {formatZecCompact(summary.totalDeshielded)}
                    </p>
                    <p className="text-[10px] font-mono text-muted mt-1">ZEC deshielded</p>
                  </div>
                </div>

                {/* Still Held */}
                <div className="relative z-10 p-4 text-center">
                  <div className="bg-glass-4 rounded-xl p-5 border border-glass-6">
                    <p className="text-[10px] font-mono uppercase tracking-wider text-muted mb-2">Still Held</p>
                    <p className="text-2xl sm:text-3xl font-bold font-mono tabular-nums text-cipher-cyan">
                      {formatZecCompact(summary.totalHeld)}
                    </p>
                    <div className="flex items-center justify-center gap-2 mt-1">
                      <span className="text-[10px] font-mono text-muted">ZEC held</span>
                      <span className="px-1.5 py-0.5 text-[9px] font-mono rounded bg-cipher-cyan/10 text-cipher-cyan border border-cipher-cyan/20">
                        {summary.heldPercent.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </div>

                {/* Moved */}
                <div className="relative z-10 p-4 text-center sm:text-right">
                  <div className="bg-glass-4 rounded-xl p-5 border border-glass-6">
                    <p className="text-[10px] font-mono uppercase tracking-wider text-muted mb-2">Spent or Moved</p>
                    <p className="text-2xl sm:text-3xl font-bold font-mono tabular-nums text-muted">
                      {formatZecCompact(summary.totalMoved)}
                    </p>
                    <div className="flex items-center justify-center sm:justify-end gap-2 mt-1">
                      <span className="text-[10px] font-mono text-muted">ZEC moved</span>
                      <span className="px-1.5 py-0.5 text-[9px] font-mono rounded bg-glass-6 text-muted">
                        {summary.movedPercent.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Composition bar */}
              {summary.totalDeshielded > 0 && (
                <div className="mt-4 mx-4">
                  <div className="h-2 rounded-full overflow-hidden flex" style={{ backgroundColor: 'var(--color-bg)' }}>
                    <div
                      className="transition-all duration-1000 rounded-l-full"
                      style={{ width: `${summary.heldPercent}%`, backgroundColor: heldColor, opacity: 0.7 }}
                    />
                    <div
                      className="transition-all duration-1000 rounded-r-full"
                      style={{ width: `${summary.movedPercent}%`, backgroundColor: movedColor, opacity: 0.4 }}
                    />
                  </div>
                  <div className="flex justify-between mt-1.5 px-0.5">
                    <span className="text-[9px] font-mono text-cipher-cyan">Held</span>
                    <span className="text-[9px] font-mono text-muted">Moved</span>
                  </div>
                </div>
              )}
            </>
          )}

          <p className="text-[10px] text-muted font-mono mt-4 mx-4 leading-relaxed">
            &quot;Held&quot; = ZEC that left a shielded pool and is still sitting untouched at its transparent address.
            &quot;Moved&quot; = ZEC that was later sent somewhere else — to an exchange, another address, or back into a shielded pool. Updated hourly.
          </p>
        </CardBody>
      </Card>

      {/* Time series chart */}
      {timeseries.length > 1 && (
        <ChartCard title="ZEC_HELD_VS_MOVED_OVER_TIME" height={240}>
          <ResponsiveContainer width="100%" height={240}>
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
                  const label = name === 'held' ? 'Still Held' : 'Moved';
                  return [`${Number(value).toFixed(2)} ZEC`, label];
                }}
              />
              <Area
                type="monotone"
                dataKey="held"
                stackId="1"
                stroke={heldColor}
                fill={heldColor}
                fillOpacity={0.3}
                name="held"
              />
              <Area
                type="monotone"
                dataKey="moved"
                stackId="1"
                stroke={movedColor}
                fill={movedColor}
                fillOpacity={0.15}
                name="moved"
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      )}
    </div>
  );
}
