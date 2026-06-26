'use client';

import { useEffect, useState } from 'react';
import {
  BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { getApiUrl } from '@/lib/api-config';
import { useTheme } from '@/contexts/ThemeContext';
import { getChartColors } from '@/lib/chart-theme';
import { ChartCard } from '@/components/network/ChartCard';
import { PeriodSelector, Period } from './PeriodSelector';

interface Bucket {
  label: string;
  minZat: number;
  maxZat: number | null;
  shieldCount: number;
  deshieldCount: number;
  shieldVolumeZat: number;
  deshieldVolumeZat: number;
}

type ViewMode = 'count' | 'volume';

export function ShieldingDistributionChart() {
  const { theme } = useTheme();
  const colors = getChartColors(theme);
  const [period, setPeriod] = useState<Period>('30d');
  const [mode, setMode] = useState<ViewMode>('count');
  const [data, setData] = useState<Bucket[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`${getApiUrl()}/api/analytics/shielding-distribution?period=${period}`)
      .then(r => r.ok ? r.json() : null)
      .then(res => {
        if (res?.buckets) setData(res.buckets);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [period]);

  const chartData = data.map(b => ({
    label: b.label + ' ZEC',
    shield: mode === 'count' ? b.shieldCount : b.shieldVolumeZat / 1e8,
    deshield: mode === 'count' ? b.deshieldCount : b.deshieldVolumeZat / 1e8,
  }));

  const controls = (
    <div className="flex items-center gap-2">
      <div className="inline-flex gap-0 p-0.5 rounded-md bg-glass-3 flex-shrink-0">
        {(['count', 'volume'] as const).map(m => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`px-1.5 py-0.5 text-[10px] font-mono rounded transition-all whitespace-nowrap ${
              mode === m
                ? 'bg-cipher-purple/15 text-cipher-purple font-bold'
                : 'text-muted hover:text-primary'
            }`}
          >
            {m === 'count' ? 'COUNT' : 'VOLUME'}
          </button>
        ))}
      </div>
      <PeriodSelector value={period} onChange={setPeriod} />
    </div>
  );

  return (
    <ChartCard
      title="SHIELDING_DISTRIBUTION"
      height={340}
      controls={controls}
    >
      {loading ? (
        <div className="flex items-center justify-center h-[340px]">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-cipher-purple border-t-transparent" />
        </div>
      ) : (
        <div>
          <p className="text-xs text-muted mb-3 leading-relaxed">
            {mode === 'count'
              ? `Transaction count by amount range (${period === 'all' ? 'all time' : `last ${period}`}). Shows which value ranges have the most activity — larger crowds mean better privacy.`
              : `Total ZEC volume by amount range (${period === 'all' ? 'all time' : `last ${period}`}). Shows where value concentrates across the shielded ecosystem.`}
          </p>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="2 6" stroke={colors.grid} opacity={0.5} />
              <XAxis
                dataKey="label"
                stroke={colors.axis}
                tick={{ fill: colors.axis, fontSize: 10 }}
                angle={-35}
                textAnchor="end"
                height={55}
              />
              <YAxis
                stroke={colors.axis}
                tick={{ fill: colors.axis, fontSize: 11 }}
                tickFormatter={(v) =>
                  mode === 'count' ? formatCount(v) : formatZec(v)
                }
              />
              <Tooltip
                cursor={{ fill: 'rgba(167, 139, 250, 0.08)' }}
                contentStyle={{
                  backgroundColor: 'var(--tooltip-bg, #1F2937)',
                  border: '1px solid var(--tooltip-border, #374151)',
                  borderRadius: '8px',
                  padding: '12px',
                  color: colors.tooltipText,
                }}
                labelStyle={{ color: colors.tooltipText, fontWeight: 'bold', marginBottom: '8px' }}
                formatter={(value, name) => [
                  <span key="v" style={{ color: colors.tooltipText }}>
                    {mode === 'count'
                      ? Number(value).toLocaleString() + ' txs'
                      : Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 }) + ' ZEC'}
                  </span>,
                  String(name) === 'shield' ? 'Shield (in)' : 'Deshield (out)',
                ]}
              />
              <Legend
                formatter={(value) => (
                  <span style={{ color: colors.tooltipText, fontSize: 11 }}>
                    {value === 'shield' ? 'Shield (in)' : 'Deshield (out)'}
                  </span>
                )}
              />
              <Bar dataKey="shield" fill={colors.purple} name="shield" radius={[3, 3, 0, 0]} />
              <Bar dataKey="deshield" fill={colors.cyan} name="deshield" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartCard>
  );
}

function formatCount(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
  return `${n}`;
}

function formatZec(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
  return n.toFixed(0);
}
