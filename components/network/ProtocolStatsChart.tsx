'use client';

import { useEffect, useState } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { getApiUrl } from '@/lib/api-config';
import { useTheme } from '@/contexts/ThemeContext';
import { getChartColors } from '@/lib/chart-theme';
import { ChartCard } from './ChartCard';

interface ProtocolPoint {
  month: string;
  saplingCommitments: number;
  saplingNullifiers: number;
  orchardCommitments: number;
  orchardNullifiers: number;
}

function formatMillions(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(0)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
  return v.toString();
}

export function ProtocolStatsChart() {
  const { theme } = useTheme();
  const colors = getChartColors(theme);
  const [data, setData] = useState<ProtocolPoint[]>([]);
  const [current, setCurrent] = useState<ProtocolPoint | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'commitments' | 'nullifiers'>('commitments');

  useEffect(() => {
    fetch(`${getApiUrl()}/api/network/protocol-stats`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.success) {
          setCurrent(d.current);
          const filtered = (d.history || []).filter((p: ProtocolPoint) => {
            const year = new Date(p.month).getFullYear();
            return year >= 2018;
          });
          setData(filtered.map((p: ProtocolPoint) => ({
            ...p,
            month: new Date(p.month).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
          })));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const controls = (
    <div className="flex gap-1">
      {(['commitments', 'nullifiers'] as const).map(v => (
        <button
          key={v}
          onClick={() => setView(v)}
          className={`px-2 py-0.5 text-[10px] font-mono rounded transition-colors ${
            view === v ? 'bg-cipher-cyan/20 text-cipher-cyan' : 'text-muted hover:text-secondary'
          }`}
        >
          {v === 'commitments' ? 'Trees' : 'Nullifiers'}
        </button>
      ))}
    </div>
  );

  if (loading) {
    return (
      <ChartCard title="PROTOCOL_GROWTH" height={280} watermarkSize="sm" controls={controls}>
        <div className="flex items-center justify-center h-[280px] text-xs text-muted">
          Loading protocol stats...
        </div>
      </ChartCard>
    );
  }

  if (!data.length) {
    return (
      <ChartCard title="PROTOCOL_GROWTH" height={280} watermarkSize="sm" controls={controls}>
        <div className="flex items-center justify-center h-[280px] text-xs text-muted">
          No protocol data available
        </div>
      </ChartCard>
    );
  }

  return (
    <ChartCard title="PROTOCOL_GROWTH" height={280} watermarkSize="sm" controls={controls}>
      {current && (
        <div className="flex gap-4 mb-3 flex-wrap">
          {view === 'commitments' ? (
            <>
              <div className="text-[10px] font-mono">
                <span className="text-muted">Sapling tree: </span>
                <span className="text-blue-400 font-semibold">{formatMillions(current.saplingCommitments)}</span>
              </div>
              <div className="text-[10px] font-mono">
                <span className="text-muted">Orchard tree: </span>
                <span className="text-emerald-400 font-semibold">{formatMillions(current.orchardCommitments)}</span>
              </div>
            </>
          ) : (
            <>
              <div className="text-[10px] font-mono">
                <span className="text-muted">Sapling nullifiers: </span>
                <span className="text-blue-400 font-semibold">{formatMillions(current.saplingNullifiers)}</span>
              </div>
              <div className="text-[10px] font-mono">
                <span className="text-muted">Orchard nullifiers: </span>
                <span className="text-emerald-400 font-semibold">{formatMillions(current.orchardNullifiers)}</span>
              </div>
            </>
          )}
        </div>
      )}
      <ResponsiveContainer width="100%" height={240}>
        <AreaChart data={data}>
          <CartesianGrid strokeDasharray="2 6" stroke={colors.grid} opacity={0.5} />
          <XAxis
            dataKey="month"
            stroke={colors.axis}
            tick={{ fill: colors.axis, fontSize: 9 }}
            interval="preserveStartEnd"
          />
          <YAxis
            stroke={colors.axis}
            tick={{ fill: colors.axis, fontSize: 9 }}
            tickFormatter={formatMillions}
            width={42}
          />
          <Tooltip
            contentStyle={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', borderRadius: 8, fontSize: 11 }}
            labelStyle={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)', fontSize: 10 }}
            formatter={(value: number, name: string) => [formatMillions(value), name]}
          />
          <Legend
            wrapperStyle={{ fontSize: 10, fontFamily: 'var(--font-mono)' }}
          />
          {view === 'commitments' ? (
            <>
              <Area
                type="monotone"
                dataKey="saplingCommitments"
                name="Sapling notes"
                stroke="#60a5fa"
                fill="#60a5fa"
                fillOpacity={0.15}
                strokeWidth={1.5}
                dot={false}
              />
              <Area
                type="monotone"
                dataKey="orchardCommitments"
                name="Orchard notes"
                stroke="#34d399"
                fill="#34d399"
                fillOpacity={0.15}
                strokeWidth={1.5}
                dot={false}
              />
            </>
          ) : (
            <>
              <Area
                type="monotone"
                dataKey="saplingNullifiers"
                name="Sapling nullifiers"
                stroke="#60a5fa"
                fill="#60a5fa"
                fillOpacity={0.15}
                strokeWidth={1.5}
                dot={false}
              />
              <Area
                type="monotone"
                dataKey="orchardNullifiers"
                name="Orchard nullifiers"
                stroke="#34d399"
                fill="#34d399"
                fillOpacity={0.15}
                strokeWidth={1.5}
                dot={false}
              />
            </>
          )}
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
