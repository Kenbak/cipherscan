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
import { InteractiveCompositionBar } from '@/components/pools/InteractiveCompositionBar';

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
  totalTransferred: number;
  totalBridge: number;
  totalExchange: number;
  totalMoved: number;
  heldPercent: number;
  reshieldedPercent: number;
  transferredPercent: number;
  bridgePercent: number;
  exchangePercent: number;
  movedPercent: number;
  txCount: number;
}

interface TurnstilePoint {
  date: string;
  deshielded: number;
  held: number;
  reshielded: number;
  transferred: number;
  bridge: number;
  exchange: number;
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

type TurnstileCategory = 'held' | 'reshielded' | 'moved' | 'transferred' | 'bridge' | 'exchange';

const TURNSTILE_HINTS: Record<TurnstileCategory, string> = {
  held: 'sitting at t-addr',
  reshielded: 'back to privacy',
  moved: 'sent elsewhere',
  transferred: 'to another t-addr',
  bridge: 'labeled bridge addr',
  exchange: 'labeled exchange addr',
};

export function TurnstileTracker({ showCardHeader = false }: TurnstileTrackerProps) {
  const { theme } = useTheme();
  const colors = getChartColors(theme);
  const flowColors = getFlowColors(theme);
  const [period, setPeriod] = useState<TurnstilePeriod>('nu6.2');
  const [summary, setSummary] = useState<TurnstileSummary | null>(null);
  const [timeseries, setTimeseries] = useState<TurnstilePoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewBuilding, setViewBuilding] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [hoveredCategory, setHoveredCategory] = useState<TurnstileCategory | null>(null);

  useEffect(() => {
    setLoading(true);
    setViewBuilding(false);
    const since = getSinceDate(period);
    fetch(`${getApiUrl()}/api/pools/turnstile?since=${since}`)
      .then(r => {
        if (r.status === 503) return r.json().then(d => { setViewBuilding(d?.status === 'building'); return null; });
        return r.ok ? r.json() : null;
      })
      .then(data => {
        if (data?.summary) setSummary(data.summary);
        if (data?.lastUpdated) setLastUpdated(data.lastUpdated);
        if (data?.timeseries) {
          setTimeseries(data.timeseries.map((p: TurnstilePoint) => ({
            ...p,
            bridge: p.bridge ?? 0,
            dateLabel: new Date(p.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          })));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [period]);

  if (viewBuilding && !summary) {
    return (
      <div className="space-y-4">
        <Card variant="glass">
          <CardBody>
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <div className="w-5 h-5 border-2 border-cipher-cyan border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-muted font-mono">Turnstile view is rebuilding — data will appear shortly</p>
              <p className="text-[10px] text-muted/60 font-mono">Auto-retries in 60s</p>
            </div>
          </CardBody>
        </Card>
      </div>
    );
  }

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
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                {[1, 2, 3, 4, 5].map(i => (
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
                  <span className="text-3xl sm:text-4xl font-bold font-mono tabular-nums text-primary">
                    {formatZecCompact(summary.totalDeshielded)}
                  </span>
                  <span className="text-sm font-mono text-muted">ZEC</span>
                  <span className="text-xs font-mono text-muted">
                    across {summary.txCount.toLocaleString()} txs
                  </span>
                </div>
              </MetricWithTooltip>

              {summary.totalDeshielded > 0 && (() => {
                const movedPct = (summary.transferredPercent ?? 0) + (summary.bridgePercent ?? 0) + summary.exchangePercent;
                const movedAmt = (summary.totalTransferred ?? 0) + (summary.totalBridge ?? 0) + summary.totalExchange;
                const movedColor = flowColors.transferred;

                const segments = showDetail
                  ? [
                      { key: 'held', pct: summary.heldPercent, amount: summary.totalHeld },
                      { key: 'reshielded', pct: summary.reshieldedPercent, amount: summary.totalReshielded },
                      { key: 'transferred', pct: summary.transferredPercent, amount: summary.totalTransferred },
                      { key: 'bridge', pct: summary.bridgePercent ?? 0, amount: summary.totalBridge ?? 0 },
                      { key: 'exchange', pct: summary.exchangePercent, amount: summary.totalExchange },
                    ]
                  : [
                      { key: 'held', pct: summary.heldPercent, amount: summary.totalHeld },
                      { key: 'reshielded', pct: summary.reshieldedPercent, amount: summary.totalReshielded },
                      { key: 'moved', pct: movedPct, amount: movedAmt },
                    ];

                const cards = showDetail
                  ? [
                      { key: 'held' as const, value: summary.totalHeld, pct: summary.heldPercent },
                      { key: 'reshielded' as const, value: summary.totalReshielded, pct: summary.reshieldedPercent },
                      { key: 'transferred' as const, value: summary.totalTransferred, pct: summary.transferredPercent },
                      { key: 'bridge' as const, value: summary.totalBridge ?? 0, pct: summary.bridgePercent ?? 0 },
                      { key: 'exchange' as const, value: summary.totalExchange, pct: summary.exchangePercent },
                    ]
                  : [
                      { key: 'held' as const, value: summary.totalHeld, pct: summary.heldPercent },
                      { key: 'reshielded' as const, value: summary.totalReshielded, pct: summary.reshieldedPercent },
                      { key: 'moved' as const, value: movedAmt, pct: movedPct },
                    ];

                const categoryColors: Record<string, string> = {
                  held: flowColors.held,
                  reshielded: flowColors.reshielded,
                  moved: movedColor,
                  transferred: flowColors.transferred,
                  bridge: flowColors.bridge ?? flowColors.transferred,
                  exchange: flowColors.exchange,
                };

                const categoryLabels: Record<string, string> = {
                  held: 'Still Held',
                  reshielded: 'Reshielded',
                  moved: 'Moved',
                  transferred: 'Transferred',
                  bridge: 'To Bridge',
                  exchange: 'To Exchange',
                };

                const tooltips: Record<string, string> = {
                  held: 'Deshielded ZEC still sitting on the original transparent address',
                  reshielded: 'ZEC that moved back into a shielded pool after deshielding',
                  moved: 'ZEC sent elsewhere — transferred, bridged, or deposited to an exchange',
                  transferred: 'ZEC sent to another transparent address (not an exchange or bridge)',
                  bridge: 'ZEC sent to a labeled cross-chain bridge address (e.g. NEAR Intents)',
                  exchange: 'ZEC sent to a labeled exchange deposit address',
                };

                return (
                  <>
                    <InteractiveCompositionBar
                      className="mb-6"
                      hoveredKey={hoveredCategory}
                      onHoverKeyChange={key => setHoveredCategory(key as TurnstileCategory | null)}
                      segments={segments.map(({ key, pct, amount }) => ({
                        key,
                        label: categoryLabels[key] ?? key,
                        percent: pct,
                        color: categoryColors[key] ?? flowColors.transferred,
                        opacity: key === 'transferred' ? 0.5 : key === 'held' ? 0.85 : key === 'moved' ? 0.6 : key === 'bridge' ? 0.65 : 0.7,
                        hint: TURNSTILE_HINTS[key as TurnstileCategory] ?? '',
                        title: `${categoryLabels[key]}: ${formatZecCompact(amount)} ZEC (${pct.toFixed(1)}%)`,
                      }))}
                    />

                    <div className="flex items-center justify-end mb-3">
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={showDetail}
                          onChange={e => setShowDetail(e.target.checked)}
                          className="w-3.5 h-3.5 rounded border-glass-12 bg-glass-4 accent-cipher-cyan"
                        />
                        <span className="text-[10px] font-mono text-muted uppercase tracking-wider">
                          Split moved
                        </span>
                      </label>
                    </div>

                    <div className={`grid gap-3 ${showDetail ? 'grid-cols-2 lg:grid-cols-5' : 'grid-cols-3'}`}>
                      {cards.map(({ key, value, pct }) => {
                        const isHovered = hoveredCategory === key;
                        const isDimmed = hoveredCategory != null && !isHovered;

                        return (
                          <div
                            key={key}
                            className={`bg-glass-4 rounded-xl p-4 border-l-2 transition-all duration-200 ${
                              isHovered ? 'ring-1 ring-glass-12 bg-glass-6' : ''
                            } ${isDimmed ? 'opacity-40' : ''}`}
                            style={{ borderLeftColor: categoryColors[key] }}
                            onMouseEnter={() => setHoveredCategory(key as TurnstileCategory)}
                            onMouseLeave={() => setHoveredCategory(null)}
                          >
                            <MetricWithTooltip label={categoryLabels[key]} tooltip={tooltips[key]}>
                              <p
                                className="text-xl font-bold font-mono tabular-nums"
                                style={{ color: categoryColors[key] }}
                              >
                                {formatZecCompact(value)}
                              </p>
                            </MetricWithTooltip>
                            <p className="text-xs font-mono text-muted mt-1">
                              {pct.toFixed(1)}% of deshielded
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </>
                );
              })()}
            </>
          )}

          <p className="text-xs text-secondary font-sans mt-6 leading-relaxed">
            Tracks what happens after ZEC leaves a shielded pool — held, reshielded, transferred, bridged cross-chain, or sent to exchanges.
            {lastUpdated && ` Updated ${new Date(lastUpdated).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at ${new Date(lastUpdated).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}.`}
            {!lastUpdated && ' Updated daily.'}
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
                    bridge: TURNSTILE_CATEGORY_LABELS.bridge,
                    exchange: TURNSTILE_CATEGORY_LABELS.exchange,
                  };
                  return [`${Number(value).toFixed(2)} ZEC`, labels[name] || name];
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
              <Area type="monotone" dataKey="held" stackId="1" stroke={flowColors.held} fill={flowColors.held} fillOpacity={0.35} name={TURNSTILE_CATEGORY_LABELS.held} />
              <Area type="monotone" dataKey="reshielded" stackId="1" stroke={flowColors.reshielded} fill={flowColors.reshielded} fillOpacity={0.3} name={TURNSTILE_CATEGORY_LABELS.reshielded} />
              <Area type="monotone" dataKey="transferred" stackId="1" stroke={flowColors.transferred} fill={flowColors.transferred} fillOpacity={0.2} name={TURNSTILE_CATEGORY_LABELS.transferred} />
              <Area type="monotone" dataKey="bridge" stackId="1" stroke={flowColors.bridge} fill={flowColors.bridge} fillOpacity={0.3} name={TURNSTILE_CATEGORY_LABELS.bridge} />
              <Area type="monotone" dataKey="exchange" stackId="1" stroke={flowColors.exchange} fill={flowColors.exchange} fillOpacity={0.25} name={TURNSTILE_CATEGORY_LABELS.exchange} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      )}
    </div>
  );
}
