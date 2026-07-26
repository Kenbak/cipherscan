'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { getApiUrl } from '@/lib/api-config';
import { useTheme } from '@/contexts/ThemeContext';
import { getChartColors } from '@/lib/chart-theme';
import { formatZecCompact } from '@/lib/format-numbers';
import { ShareableCard } from '@/components/ShareableCard';
import { formatChartDate, tooltipDate } from '@/lib/chart-dates';
import { privacyAxisLabel } from '@/components/privacy/privacy-chart-axis';

type Period = '30d' | '90d' | '1y' | 'all';
type View = 'rate' | 'composition' | 'pools';

const CHART_HEIGHT = 360;
const CHART_MARGIN = { top: 12, right: 16, left: 4, bottom: 56 };
const Y_AXIS_WIDTH = 64;

const VIEW_META: Record<View, { label: string; shortLabel: string; description: string }> = {
  rate: {
    label: 'Shielded %',
    shortLabel: 'Shielded %',
    description:
      'Share of circulating supply held in shielded pools over time. For absolute balances use Public / private or Per pool.',
  },
  composition: {
    label: 'Public / private',
    shortLabel: 'Public / private',
    description:
      'Shielded vs transparent supply in ZEC. Unmined supply is excluded — only issued pools on chain.',
  },
  pools: {
    label: 'Per pool',
    shortLabel: 'Per pool',
    description: 'How each value pool grew or shrank — Sprout through Ironwood — from daily chain state.',
  },
};

interface PoolPoint {
  date: string;
  shielded: number;
  sprout: number;
  sapling: number;
  orchard: number;
  ironwood: number;
  transparent: number;
  shieldedSupplyPct: number | null;
}

function segmentedClass(active: boolean) {
  return `px-2 py-1 text-[10px] font-mono uppercase tracking-wide rounded transition-all whitespace-nowrap ${
    active ? 'bg-cipher-cyan/15 text-cipher-cyan font-bold' : 'text-muted hover:text-primary'
  }`;
}

function supplyXAxisTitle(value: string, fill: string) {
  return {
    value,
    position: 'insideBottom' as const,
    offset: -6,
    ...privacyAxisLabel(fill),
  };
}

function SupplyChartFrame({ yLabel, children }: { yLabel: string; children: ReactNode }) {
  return (
    <div className="flex items-stretch gap-2">
      <div className="flex w-5 shrink-0 items-center justify-center" aria-hidden="true">
        <span className="origin-center -rotate-90 whitespace-nowrap text-[10px] font-mono text-muted">
          {yLabel}
        </span>
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function RateTooltip({
  active,
  payload,
  label,
  colors,
}: {
  active?: boolean;
  payload?: Array<{ payload: Record<string, unknown> }>;
  label?: string;
  colors: ReturnType<typeof getChartColors>;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  const rate = row.shieldedPct as number | null;
  const shielded = row.shielded as number;
  const transparent = row.transparent as number;
  const total = shielded + transparent;

  return (
    <div
      className="rounded-lg border px-3 py-2 text-xs font-mono shadow-lg"
      style={{
        backgroundColor: colors.tooltipBg,
        borderColor: colors.tooltipBorder,
        color: colors.tooltipText,
      }}
    >
      <p className="mb-2 text-[10px] uppercase tracking-wider text-muted">{tooltipDate(payload, label)}</p>
      {rate != null ? (
        <p className="mb-1 tabular-nums">
          <span className="text-cipher-cyan font-bold">{rate.toFixed(2)}%</span>
          <span className="text-muted"> shielded</span>
        </p>
      ) : null}
      <p className="tabular-nums text-secondary">{formatZecCompact(shielded)} ZEC shielded</p>
      <p className="tabular-nums text-muted">{formatZecCompact(transparent)} ZEC transparent</p>
      {total > 0 ? (
        <p className="mt-1 border-t border-glass-6 pt-1 tabular-nums text-muted">
          {formatZecCompact(total)} ZEC tracked
        </p>
      ) : null}
    </div>
  );
}

function CompositionTooltip({
  active,
  payload,
  label,
  colors,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; color?: string }>;
  label?: string;
  colors: ReturnType<typeof getChartColors>;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div
      className="rounded-lg border px-3 py-2 text-xs font-mono shadow-lg"
      style={{
        backgroundColor: colors.tooltipBg,
        borderColor: colors.tooltipBorder,
        color: colors.tooltipText,
      }}
    >
      <p className="mb-2 text-[10px] uppercase tracking-wider text-muted">{tooltipDate(payload, label)}</p>
      {payload.map((entry) => (
        <p key={String(entry.name)} className="tabular-nums text-secondary">
          <span style={{ color: entry.color }}>{entry.name}</span>
          {': '}
          {formatZecCompact(Number(entry.value ?? 0))} ZEC
        </p>
      ))}
    </div>
  );
}

function PoolsTooltip({
  active,
  payload,
  label,
  colors,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; color?: string }>;
  label?: string;
  colors: ReturnType<typeof getChartColors>;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div
      className="rounded-lg border px-3 py-2 text-xs font-mono shadow-lg"
      style={{
        backgroundColor: colors.tooltipBg,
        borderColor: colors.tooltipBorder,
        color: colors.tooltipText,
      }}
    >
      <p className="mb-2 text-[10px] uppercase tracking-wider text-muted">{tooltipDate(payload, label)}</p>
      {payload
        .filter((entry) => Number(entry.value ?? 0) > 0)
        .map((entry) => (
          <p key={String(entry.name)} className="tabular-nums text-secondary">
            <span style={{ color: entry.color }}>{entry.name}</span>
            {': '}
            {formatZecCompact(Number(entry.value ?? 0))} ZEC
          </p>
        ))}
    </div>
  );
}

export function PoolDistributionChart() {
  const { theme } = useTheme();
  const colors = getChartColors(theme);
  const [period, setPeriod] = useState<Period>('all');
  const [view, setView] = useState<View>('pools');
  const [points, setPoints] = useState<PoolPoint[]>([]);
  const [hasPerPoolHistory, setHasPerPoolHistory] = useState(false);
  const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`${getApiUrl()}/api/network/pool-history?period=${period}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.points) setPoints(data.points);
        setHasPerPoolHistory(!!data?.hasVerifiedPerPoolBreakdown);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [period]);

  const canShowPools =
    hasPerPoolHistory || points.some((p) => p.orchard > 0 || (p as PoolPoint).ironwood > 0);

  useEffect(() => {
    if (!loading && view === 'pools' && !canShowPools) {
      setView('composition');
    }
  }, [loading, view, canShowPools]);

  const chartData = useMemo(
    () =>
      points.map((p) => ({
        ...p,
        shieldedPct: p.shieldedSupplyPct,
      })),
    [points],
  );

  const pctValues = chartData.map((d) => d.shieldedPct).filter((v): v is number => v != null && v > 0);
  const rateYMin = pctValues.length ? Math.max(0, Math.floor(Math.min(...pctValues) - 2)) : 0;
  const rateYMax = pctValues.length ? Math.min(100, Math.ceil(Math.max(...pctValues) + 2)) : 40;

  const maxSupplyZec = useMemo(() => {
    let max = 0;
    for (const p of chartData) {
      const total = (p.shielded || 0) + (p.transparent || 0);
      if (total > max) max = total;
    }
    return max * 1.05 || 1;
  }, [chartData]);

  const viewOptions: { key: View; label: string; title: string }[] = [
    ...(canShowPools
      ? [{ key: 'pools' as View, label: VIEW_META.pools.shortLabel, title: VIEW_META.pools.label }]
      : []),
    { key: 'composition', label: VIEW_META.composition.shortLabel, title: VIEW_META.composition.label },
    { key: 'rate', label: VIEW_META.rate.shortLabel, title: VIEW_META.rate.label },
  ];

  const meta = VIEW_META[view];
  const axisFill = colors.axis;
  const shareText = `Zcash supply history (${meta.shortLabel}, ${period.toUpperCase()}) on CipherScan.\n\nhttps://cipherscan.app/pools#supply`;

  const controls = (
    <div className="mb-4 flex flex-wrap items-center justify-end gap-2" data-html2canvas-ignore="true">
      <div className="inline-flex gap-0 rounded-md bg-glass-3 p-0.5" role="group" aria-label="Chart view">
        {viewOptions.map(({ key, label, title: tabTitle }) => (
          <button
            key={key}
            type="button"
            title={tabTitle}
            onClick={() => setView(key)}
            className={segmentedClass(view === key)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="inline-flex gap-0 rounded-md bg-glass-3 p-0.5" role="group" aria-label="Time range">
        {(['30d', '90d', '1y', 'all'] as Period[]).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPeriod(p)}
            className={segmentedClass(period === p)}
          >
            {p.toUpperCase()}
          </button>
        ))}
      </div>
    </div>
  );

  const chartBody = loading ? (
    <div className="flex items-center justify-center" style={{ height: CHART_HEIGHT }}>
      <div className="mx-6 h-48 w-full max-w-lg animate-pulse rounded skeleton-bg" />
    </div>
  ) : chartData.length === 0 ? (
    <div
      className="flex items-center justify-center text-xs font-mono text-muted"
      style={{ height: CHART_HEIGHT }}
    >
      No supply history for this range.
    </div>
  ) : view === 'pools' && canShowPools ? (
    <SupplyChartFrame yLabel="ZEC in pools">
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <AreaChart data={chartData} margin={CHART_MARGIN}>
          <CartesianGrid strokeDasharray="2 6" stroke={colors.grid} opacity={0.5} />
          <XAxis
            dataKey="date"
            stroke={colors.axis}
            tick={{ fill: colors.axis, fontSize: 10 }}
            tickFormatter={(v) => formatChartDate(String(v))}
            interval="preserveStartEnd"
            label={supplyXAxisTitle('Date', axisFill)}
          />
          <YAxis
            stroke={colors.axis}
            tick={{ fill: colors.axis, fontSize: 10 }}
            tickFormatter={(v) => formatZecCompact(v)}
            domain={[0, maxSupplyZec]}
            width={Y_AXIS_WIDTH}
          />
        <Tooltip content={<PoolsTooltip colors={colors} />} />
        <Legend
          wrapperStyle={{ fontSize: 11, cursor: 'pointer', paddingTop: 8 }}
          onClick={(data) => {
            const key = String(data.dataKey ?? '');
            if (!key) return;
            setHiddenSeries((prev) => {
              const next = new Set(prev);
              if (next.has(key)) next.delete(key);
              else next.add(key);
              return next;
            });
          }}
        />
        <Area type="monotone" dataKey="ironwood" stackId="1" stroke={colors.ironwood} fill={colors.ironwood} fillOpacity={0.65} name="Ironwood" hide={hiddenSeries.has('ironwood')} />
        <Area type="monotone" dataKey="orchard" stackId="1" stroke={colors.orchard} fill={colors.orchard} fillOpacity={0.6} name="Orchard" hide={hiddenSeries.has('orchard')} />
        <Area type="monotone" dataKey="sapling" stackId="1" stroke={colors.sapling} fill={colors.sapling} fillOpacity={0.6} name="Sapling" hide={hiddenSeries.has('sapling')} />
        <Area type="monotone" dataKey="sprout" stackId="1" stroke={colors.sprout} fill={colors.sprout} fillOpacity={0.5} name="Sprout" hide={hiddenSeries.has('sprout')} />
        <Area type="monotone" dataKey="transparent" stackId="1" stroke={colors.transparent} fill={colors.transparent} fillOpacity={0.35} name="Transparent" hide={hiddenSeries.has('transparent')} />
      </AreaChart>
    </ResponsiveContainer>
    </SupplyChartFrame>
  ) : view === 'composition' ? (
    <SupplyChartFrame yLabel="Chain supply (ZEC)">
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <AreaChart data={chartData} margin={CHART_MARGIN}>
          <CartesianGrid strokeDasharray="2 6" stroke={colors.grid} opacity={0.5} />
          <XAxis
            dataKey="date"
            stroke={colors.axis}
            tick={{ fill: colors.axis, fontSize: 10 }}
            tickFormatter={(v) => formatChartDate(String(v))}
            interval="preserveStartEnd"
            label={supplyXAxisTitle('Date', axisFill)}
          />
          <YAxis
            stroke={colors.axis}
            tick={{ fill: colors.axis, fontSize: 10 }}
            tickFormatter={(v) => formatZecCompact(v)}
            domain={[0, maxSupplyZec]}
            width={Y_AXIS_WIDTH}
          />
        <Tooltip content={<CompositionTooltip colors={colors} />} />
        <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
        <Area type="monotone" dataKey="shielded" stackId="1" stroke={colors.shielded} fill={colors.shielded} fillOpacity={0.55} name="Shielded" />
        <Area type="monotone" dataKey="transparent" stackId="1" stroke={colors.transparent} fill={colors.transparent} fillOpacity={0.35} name="Transparent" />
      </AreaChart>
    </ResponsiveContainer>
    </SupplyChartFrame>
  ) : (
    <SupplyChartFrame yLabel="Shielded %">
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <LineChart data={chartData} margin={CHART_MARGIN}>
          <CartesianGrid strokeDasharray="2 6" stroke={colors.grid} opacity={0.5} />
          <XAxis
            dataKey="date"
            stroke={colors.axis}
            tick={{ fill: colors.axis, fontSize: 10 }}
            tickFormatter={(v) => formatChartDate(String(v))}
            interval="preserveStartEnd"
            label={supplyXAxisTitle('Date', axisFill)}
          />
          <YAxis
            stroke={colors.axis}
            tick={{ fill: colors.axis, fontSize: 10 }}
            domain={[rateYMin, rateYMax]}
            tickFormatter={(v) => `${v}%`}
            width={48}
          />
        <Tooltip content={<RateTooltip colors={colors} />} />
        <Line
          type="monotone"
          dataKey="shieldedPct"
          stroke={colors.cyan ?? colors.shielded}
          strokeWidth={2.5}
          dot={false}
          name="Shielding rate"
          connectNulls
        />
      </LineChart>
    </ResponsiveContainer>
    </SupplyChartFrame>
  );

  return (
    <ShareableCard
      title="Supply History"
      sourceHeight={0}
      isLive
      shareText={shareText}
      fileName="cipherscan-supply-history.png"
      watermark={true}
      className=""
      footerNote={`${meta.shortLabel} · ${period.toUpperCase()}`}
    >
      <p className="mb-4 max-w-2xl text-xs leading-relaxed text-secondary font-sans">
        Daily pool balances from chain state — stack by pool, split public vs private, or track shielded share over
        time.
      </p>
      {controls}
      {chartBody}
      <p className="mt-3 text-xs leading-relaxed text-muted">{meta.description}</p>
    </ShareableCard>
  );
}
