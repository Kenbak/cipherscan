'use client';

import { useEffect, useState, useMemo } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { getApiUrl } from '@/lib/api-config';
import { useTheme } from '@/contexts/ThemeContext';
import { getChartColors } from '@/lib/chart-theme';
import { ChartCard } from './ChartCard';

interface RawPoint {
  month: string;
  saplingCommitments: number;
  saplingNullifiers: number;
  orchardCommitments: number;
  orchardNullifiers: number;
}

interface ChartPoint extends RawPoint {
  label: string;
}

function formatMillions(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
  return v.toString();
}

type Period = '2y' | '4y' | 'all';

export function ProtocolStatsChart() {
  const { theme } = useTheme();
  const colors = getChartColors(theme);
  const [rawData, setRawData] = useState<RawPoint[]>([]);
  const [current, setCurrent] = useState<RawPoint | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'commitments' | 'nullifiers'>('commitments');
  const [period, setPeriod] = useState<Period>('4y');

  useEffect(() => {
    fetch(`${getApiUrl()}/api/network/protocol-stats`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.success) {
          setCurrent(d.current);
          // Filter out months before any meaningful data exists
          const meaningful = (d.history || []).filter((p: RawPoint) =>
            p.saplingCommitments > 0 || p.orchardCommitments > 0
          );
          setRawData(meaningful);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const data: ChartPoint[] = useMemo(() => {
    if (!rawData.length) return [];

    let filtered = rawData;
    if (period !== 'all') {
      const years = period === '2y' ? 2 : 4;
      const cutoff = new Date();
      cutoff.setFullYear(cutoff.getFullYear() - years);
      filtered = rawData.filter(p => new Date(p.month) >= cutoff);
    }

    return filtered.map(p => ({
      ...p,
      label: new Date(p.month).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
    }));
  }, [rawData, period]);

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
      <span className="w-px bg-cipher-border-alpha/30 mx-1" />
      {(['2y', '4y', 'all'] as const).map(p => (
        <button
          key={p}
          onClick={() => setPeriod(p)}
          className={`px-2 py-0.5 text-[10px] font-mono rounded transition-colors ${
            period === p ? 'bg-cipher-cyan/20 text-cipher-cyan' : 'text-muted hover:text-secondary'
          }`}
        >
          {p === 'all' ? 'All' : p.toUpperCase()}
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
        <div className="mb-3">
          <div className="flex gap-4 flex-wrap">
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
          <p className="text-[9px] font-mono text-muted/60 mt-1.5">
            {view === 'commitments'
              ? 'Note commitments added to each pool\u2019s Merkle tree. Each shielded output creates one commitment. Larger tree = more private transactions processed.'
              : 'Nullifiers revealed when notes are spent. Sapling counts real spends only. Orchard includes padding (each Action = 1 spend + 1 output for uniform privacy).'}
          </p>
        </div>
      )}
      <ResponsiveContainer width="100%" height={240}>
        <AreaChart data={data}>
          <CartesianGrid strokeDasharray="2 6" stroke={colors.grid} opacity={0.5} />
          <XAxis
            dataKey="label"
            stroke={colors.axis}
            tick={{ fill: colors.axis, fontSize: 9 }}
            interval="preserveStartEnd"
          />
          <YAxis
            stroke={colors.axis}
            tick={{ fill: colors.axis, fontSize: 9 }}
            tickFormatter={formatMillions}
            width={42}
            domain={period === 'all' || period === '4y' ? [0, 'auto'] : ['dataMin', 'auto']}
          />
          <Tooltip
            contentStyle={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)', borderRadius: 8, fontSize: 11 }}
            labelStyle={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)', fontSize: 10 }}
            formatter={(value) => formatMillions(Number(value))}
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
