'use client';

import { useMemo } from 'react';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { ShareableCard } from '@/components/ShareableCard';
import { PeriodSelector, type Period } from '@/components/privacy/PeriodSelector';
import { getChartColors } from '@/lib/chart-theme';
import { formatTrendDate, normalizeTrendDateKey, parseTrendDate } from '@/lib/privacy-trend-dates';

const CHART_VIEWS = [
  { id: 'adoption', label: 'TX ADOPTION' },
  { id: 'activity', label: 'DAILY ACTIVITY' },
  { id: 'score', label: 'SCORE HISTORY' },
] as const;

export type TrendChartView = (typeof CHART_VIEWS)[number]['id'];

type TrendDay = {
  date: string;
  shielded: number;
  transparent: number;
  poolSize: number;
  shieldedPercentage: number;
  privacyScore: number;
};

function filterTrendsByPeriod(daily: TrendDay[], period: Period): TrendDay[] {
  if (period === 'all' || daily.length === 0) return daily;
  const daysMap: Record<Exclude<Period, 'all'>, number> = {
    '7d': 7,
    '30d': 30,
    '90d': 90,
    '1y': 365,
  };
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - daysMap[period]);
  const cutoffMs = cutoff.getTime();
  return daily.filter((row) => {
    const ms = parseTrendDate(row.date).getTime();
    return !Number.isNaN(ms) && ms >= cutoffMs;
  });
}

function segmentedClass(active: boolean) {
  return `px-1.5 py-0.5 text-[10px] font-mono rounded transition whitespace-nowrap ${
    active
      ? 'bg-cipher-cyan/15 text-cipher-cyan font-bold'
      : 'text-muted hover:text-primary'
  }`;
}

function chartDescription(view: TrendChartView) {
  if (view === 'adoption') {
    return 'Daily share of non-coinbase transactions that use shielded pools — transaction count, not ZEC volume.';
  }
  if (view === 'activity') {
    return 'Daily shielded vs transparent transaction counts (coinbase excluded from transparent).';
  }
  return 'Privacy Score over time. Step changes may reflect formula updates.';
}

function buildShareText(
  view: TrendChartView,
  period: Period,
  privacyScore: number,
  chartData: TrendDay[],
) {
  const periodLabel = period === 'all' ? 'all time' : period.toUpperCase();
  const url = 'https://cipherscan.app/privacy';
  const latest = chartData[chartData.length - 1];

  if (view === 'score') {
    const score = latest?.privacyScore ?? privacyScore;
    return `Zcash Privacy Score: ${score}/100 (${periodLabel}) on CipherScan\n\n${url}`;
  }
  if (view === 'adoption' && latest) {
    return `Zcash shielded tx share: ${latest.shieldedPercentage.toFixed(1)}% (${periodLabel}) on CipherScan\n\n${url}`;
  }
  if (view === 'activity' && latest) {
    return `Zcash shielded activity: ${latest.shielded.toLocaleString()} shielded txs (${periodLabel}) on CipherScan\n\n${url}`;
  }
  return `Zcash privacy metrics on CipherScan (${periodLabel})\n\n${url}`;
}

export function PrivacyTrendsSection({
  trendHistory,
  privacyScore,
  lastBlockScanned,
  theme,
  view,
  onViewChange,
  period,
  onPeriodChange,
}: {
  trendHistory: TrendDay[];
  privacyScore: number;
  lastBlockScanned: number;
  theme: 'dark' | 'light';
  view: TrendChartView;
  onViewChange: (view: TrendChartView) => void;
  period: Period;
  onPeriodChange: (period: Period) => void;
}) {
  const colors = getChartColors(theme);
  const filtered = useMemo(
    () => filterTrendsByPeriod(trendHistory, period),
    [trendHistory, period],
  );
  const chartData = useMemo(
    () =>
      [...filtered]
        .reverse()
        .map((row) => ({ ...row, date: normalizeTrendDateKey(row.date) })),
    [filtered],
  );
  const shareText = buildShareText(view, period, privacyScore, chartData);
  const tooltipStyle = {
    backgroundColor: colors.tooltipBg,
    border: `1px solid ${colors.tooltipBorder}`,
    borderRadius: '8px',
    color: colors.tooltipText,
  };

  const axisLabel = { fill: colors.axis, fontSize: 10 };
  const xLabel = { value: 'Date', position: 'insideBottom' as const, offset: -2, ...axisLabel };
  const yAdoptionLabel = {
    value: 'Shielded tx %',
    angle: -90,
    position: 'insideLeft' as const,
    ...axisLabel,
  };
  const yActivityLabel = {
    value: 'Transactions',
    angle: -90,
    position: 'insideLeft' as const,
    ...axisLabel,
  };
  const yScoreLabel = {
    value: 'Score (0–100)',
    angle: -90,
    position: 'insideLeft' as const,
    ...axisLabel,
  };

  return (
    <ShareableCard
      title="Historical trends"
      sourceHeight={lastBlockScanned}
      shareText={shareText}
      fileName="cipherscan-privacy-trends.png"
      className=""
    >
      <div
        className="mb-4 flex flex-wrap items-center justify-between gap-3"
        data-html2canvas-ignore="true"
      >
        <div className="inline-flex gap-0 rounded-md bg-glass-3 p-0.5">
          {CHART_VIEWS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => onViewChange(id)}
              className={segmentedClass(view === id)}
            >
              {label}
            </button>
          ))}
        </div>
        <PeriodSelector value={period} onChange={onPeriodChange} />
      </div>

      <p className="mb-4 text-xs leading-relaxed text-muted">{chartDescription(view)}</p>

      {chartData.length === 0 ? (
        <div className="flex h-[320px] items-center justify-center text-xs font-mono text-muted">
          No trend data for this range.
        </div>
      ) : (
        <div className="h-[320px]">
          {view === 'adoption' && (
            <ResponsiveContainer initialDimension={{ width: 500, height: 300 }} width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 12, left: 4, bottom: 20 }}>
                <CartesianGrid strokeDasharray="2 6" stroke={colors.gridStroke} />
                <XAxis
                  dataKey="date"
                  tick={{ fill: colors.axis, fontSize: 10 }}
                  tickFormatter={(value) => formatTrendDate(value)}
                  angle={-35}
                  textAnchor="end"
                  height={52}
                  label={xLabel}
                />
                <YAxis
                  tick={{ fill: colors.axis, fontSize: 10 }}
                  domain={[0, 100]}
                  width={52}
                  label={yAdoptionLabel}
                />
                <RechartsTooltip
                  contentStyle={tooltipStyle}
                  labelFormatter={(label) => formatTrendDate(label)}
                  formatter={(v) => [`${Number(v).toFixed(1)}%`, 'Shielded tx share']}
                />
                <Line
                  type="monotone"
                  dataKey="shieldedPercentage"
                  stroke={colors.cyan}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
          {view === 'activity' && (
            <ResponsiveContainer initialDimension={{ width: 500, height: 300 }} width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 12, left: 4, bottom: 20 }}>
                <CartesianGrid strokeDasharray="2 6" stroke={colors.gridStroke} />
                <XAxis
                  dataKey="date"
                  tick={{ fill: colors.axis, fontSize: 10 }}
                  tickFormatter={(value) => formatTrendDate(value)}
                  angle={-35}
                  textAnchor="end"
                  height={52}
                  label={xLabel}
                />
                <YAxis
                  tick={{ fill: colors.axis, fontSize: 10 }}
                  width={56}
                  label={yActivityLabel}
                />
                <RechartsTooltip
                  contentStyle={tooltipStyle}
                  labelFormatter={(label) => formatTrendDate(label)}
                />
                <Legend wrapperStyle={{ fontSize: 11, color: colors.axis }} />
                <Bar dataKey="shielded" name="Shielded" fill={colors.cyan} radius={[3, 3, 0, 0]} />
                <Bar
                  dataKey="transparent"
                  name="Transparent"
                  fill={colors.transparent}
                  radius={[3, 3, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
          {view === 'score' && (
            <ResponsiveContainer initialDimension={{ width: 500, height: 300 }} width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 8, right: 12, left: 4, bottom: 20 }}>
                <defs>
                  <linearGradient id="privacyScoreFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={colors.cyan} stopOpacity={0.35} />
                    <stop offset="95%" stopColor={colors.cyan} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="2 6" stroke={colors.gridStroke} />
                <XAxis
                  dataKey="date"
                  tick={{ fill: colors.axis, fontSize: 10 }}
                  tickFormatter={(value) => formatTrendDate(value)}
                  angle={-35}
                  textAnchor="end"
                  height={52}
                  label={xLabel}
                />
                <YAxis
                  tick={{ fill: colors.axis, fontSize: 10 }}
                  domain={[0, 100]}
                  width={52}
                  label={yScoreLabel}
                />
                <RechartsTooltip
                  contentStyle={tooltipStyle}
                  labelFormatter={(label) => formatTrendDate(label)}
                  formatter={(v) => [`${Number(v).toFixed(0)} / 100`, 'Privacy Score']}
                />
                <Area
                  type="monotone"
                  dataKey="privacyScore"
                  stroke={colors.cyan}
                  strokeWidth={2}
                  fill="url(#privacyScoreFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      )}
    </ShareableCard>
  );
}
