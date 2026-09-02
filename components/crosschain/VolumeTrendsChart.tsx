'use client';

import { useMemo, useState } from 'react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { useTheme } from '@/contexts/ThemeContext';
import { getChartColors } from '@/lib/chart-theme';
import { useApiQuery } from '@/hooks/useApiQuery';
import { ChartCard } from '@/components/network/ChartCard';
import { PeriodPillTags } from '@/components/ui/PeriodPillTags';
import { formatUSD, formatValue, type DisplayUnit } from '@/components/crosschain/format';

type Period = '7d' | '30d';

interface TrendPoint {
  date: string;
  inflowVolume: number;
  outflowVolume: number;
  inflowCount: number;
  outflowCount: number;
}

interface TrendsResponse {
  success: boolean;
  volumeChange?: number;
  data: TrendPoint[];
}

const PERIOD_OPTIONS: { key: Period; label: string }[] = [
  { key: '7d', label: '7D' },
  { key: '30d', label: '30D' },
];

function TrendTooltip({ active, payload, colors, unit, zecPrice }: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; payload?: TrendPoint }>;
  label?: string;
  colors: ReturnType<typeof getChartColors>;
  unit: DisplayUnit;
  zecPrice: number | null;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  const fv = (v: number) => formatValue(v, unit, zecPrice);

  return (
    <div
      className="rounded-lg border px-3 py-2 text-xs font-mono shadow-lg"
      style={{ backgroundColor: colors.tooltipBg, borderColor: colors.tooltipBorder, color: colors.tooltipText }}
    >
      <p className="mb-2 text-[10px] uppercase tracking-wider text-muted">{new Date(row.date).toLocaleDateString()}</p>
      <p className="tabular-nums text-secondary"><span className="text-cipher-green">Inflows</span>: {fv(row.inflowVolume)}</p>
      <p className="tabular-nums text-secondary"><span className="text-cipher-orange">Outflows</span>: {fv(row.outflowVolume)}</p>
    </div>
  );
}

export function VolumeTrendsChart({ unit = 'usd', zecPrice = null }: { unit?: DisplayUnit; zecPrice?: number | null }) {
  const { theme } = useTheme();
  const colors = getChartColors(theme);
  const [period, setPeriod] = useState<Period>('30d');
  const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(new Set());

  const { data, loading } = useApiQuery<TrendsResponse>('/api/crosschain/trends', { period, granularity: 'daily' });

  const points = useMemo(
    () => (data?.data ?? []).map((p) => {
      const outflowVolumeNeg = -Math.abs(p.outflowVolume);
      return { ...p, outflowVolumeNeg, net: p.inflowVolume + outflowVolumeNeg };
    }),
    [data],
  );

  const volumeChange = data?.volumeChange ?? 0;
  const barSize = Math.max(4, Math.floor(600 / Math.max(points.length, 1)));

  const fv = (v: number) => formatValue(Math.abs(v), unit, zecPrice);

  const controls = (
    <PeriodPillTags options={PERIOD_OPTIONS} value={period} onChange={setPeriod} aria-label="Volume trend period" />
  );

  return (
    <ChartCard title="VOLUME_TRENDS" controls={controls} height={300}>
      {volumeChange !== 0 && (
        <p className="text-xs font-mono text-muted mb-3">
          Period change:{' '}
          <span className={volumeChange > 0 ? 'text-cipher-green font-bold' : 'text-cipher-orange font-bold'}>
            {volumeChange > 0 ? '+' : ''}{volumeChange.toFixed(1)}%
          </span>
        </p>
      )}
      {loading && points.length === 0 ? (
        <div className="flex items-center justify-center h-[260px]">
          <div className="animate-pulse text-muted font-mono text-xs">Loading...</div>
        </div>
      ) : points.length === 0 ? (
        <div className="flex items-center justify-center h-[260px] text-xs font-mono text-muted">No trend data available</div>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={points} barSize={barSize} barGap={-barSize}>
            <CartesianGrid strokeDasharray="2 6" stroke={colors.grid} opacity={0.5} />
            <XAxis
              dataKey="date"
              stroke={colors.axis}
              tick={{ fill: colors.axis, fontSize: 10 }}
              tickFormatter={(v: string) => { const d = new Date(v); return `${d.getMonth() + 1}/${d.getDate()}`; }}
            />
            <YAxis stroke={colors.axis} tick={{ fill: colors.axis, fontSize: 10 }} tickFormatter={(v: number) => fv(v)} width={54} />
            <Tooltip content={<TrendTooltip colors={colors} unit={unit} zecPrice={zecPrice} />} />
            <Legend
              wrapperStyle={{ fontSize: 11, paddingTop: 8, cursor: 'pointer' }}
              onClick={(d) => {
                const key = String(d.dataKey ?? '');
                if (!key) return;
                setHiddenSeries((prev) => {
                  const next = new Set(prev);
                  if (next.has(key)) next.delete(key); else next.add(key);
                  return next;
                });
              }}
              formatter={(value) => {
                const key = String(value);
                const label = key === 'inflowVolume' ? 'Inflows' : 'Outflows';
                const hidden = hiddenSeries.has(key);
                return <span style={{ opacity: hidden ? 0.35 : 1, textDecoration: hidden ? 'line-through' : 'none' }}>{label}</span>;
              }}
            />
            <ReferenceLine y={0} stroke={colors.grid} strokeDasharray="2 6" />
            <Bar dataKey="inflowVolume" name="inflowVolume" fill="var(--color-cipher-green)" fillOpacity={0.75} radius={[2, 2, 0, 0]} hide={hiddenSeries.has('inflowVolume')} />
            <Bar dataKey="outflowVolumeNeg" name="outflowVolume" fill="var(--color-cipher-orange)" fillOpacity={0.6} radius={[0, 0, 2, 2]} hide={hiddenSeries.has('outflowVolume')} />
            <Line type="monotone" dataKey="net" stroke={colors.tooltipText} strokeWidth={1.5} strokeDasharray="4 3" dot={false} name="net" legendType="none" />
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}
