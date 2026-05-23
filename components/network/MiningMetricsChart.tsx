'use client';

import { useEffect, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { getApiUrl } from '@/lib/api-config';
import { useTheme } from '@/contexts/ThemeContext';
import { getChartColors } from '@/lib/chart-theme';
import { formatDifficulty, formatHashrate } from '@/lib/format-numbers';
import { ChartCard } from './ChartCard';

type MetricKey = 'solrate' | 'difficulty' | 'blockTime' | 'txFees' | 'txCount';

const METRICS: { key: MetricKey; label: string; color: string; format: (v: number) => string }[] = [
  { key: 'solrate', label: 'Solrate', color: 'cyan', format: (v) => formatHashrate(v) },
  { key: 'difficulty', label: 'Difficulty', color: 'yellow', format: (v) => formatDifficulty(v) },
  { key: 'blockTime', label: 'Block time', color: 'green', format: (v) => `~${Math.round(v)}s` },
  { key: 'txFees', label: 'TX fees', color: 'purple', format: (v) => `${v.toFixed(6)} ZEC` },
  { key: 'txCount', label: 'TX count', color: 'cyan', format: (v) => v.toFixed(1) },
];

export function MiningMetricsChart() {
  const { theme } = useTheme();
  const colors = getChartColors(theme);
  const [active, setActive] = useState<MetricKey>('solrate');
  const [points, setPoints] = useState<{ height: number; solrate: number; difficulty: number; blockTime: number; txFees: number; txCount: number }[]>([]);
  const [latest, setLatest] = useState<Record<string, number>>({});
  const [window, setWindow] = useState(20);

  useEffect(() => {
    fetch(`${getApiUrl()}/api/network/mining-metrics?window=${window}&limit=120`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.points) setPoints(data.points);
        if (data?.latest) setLatest(data.latest);
        if (data?.window) setWindow(data.window);
      })
      .catch(() => {});
  }, [window]);

  const metric = METRICS.find((m) => m.key === active)!;
  const stroke = metric.color === 'cyan' ? colors.cyan : metric.color === 'yellow' ? colors.yellow : metric.color === 'green' ? colors.orchard : colors.purple;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {METRICS.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => setActive(m.key)}
            className={`card p-3 text-left transition-all ${active === m.key ? 'ring-1 ring-cipher-cyan/40' : 'opacity-80 hover:opacity-100'}`}
          >
            <p className="text-[10px] text-muted font-mono uppercase mb-1">{m.label}</p>
            <p className="text-sm font-bold font-mono text-primary whitespace-nowrap truncate">
              {latest[m.key] != null ? m.format(latest[m.key]) : '—'}
            </p>
            <p className="text-[9px] text-muted font-mono mt-0.5">{window} blk avg</p>
          </button>
        ))}
      </div>

      <ChartCard title="MINING_TRENDS" height={280}>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={points}>
            <CartesianGrid strokeDasharray="2 6" stroke={colors.grid} opacity={0.5} />
            <XAxis
              dataKey="height"
              stroke={colors.axis}
              tick={{ fill: colors.axis, fontSize: 10 }}
              tickFormatter={(h) => `${Math.round(h / 1000)}k`}
            />
            <YAxis
              stroke={colors.axis}
              tick={{ fill: colors.axis, fontSize: 10 }}
              tickFormatter={(v) => (active === 'difficulty' ? formatDifficulty(v) : active === 'solrate' ? formatHashrate(v) : String(Math.round(v * 100) / 100))}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: colors.tooltipBg,
                border: `1px solid ${colors.tooltipBorder}`,
                borderRadius: '8px',
                fontSize: 12,
              }}
              labelFormatter={(h) => `Block ${h}`}
              formatter={(value: number) => [metric.format(value), metric.label]}
            />
            <Line type="monotone" dataKey={active} stroke={stroke} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}
