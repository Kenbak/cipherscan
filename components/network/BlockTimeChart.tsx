'use client';

import { useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, CartesianGrid } from 'recharts';
import { useApiQuery } from '@/hooks/useApiQuery';
import { ChartCard } from './ChartCard';

type Point = { height: number; timestamp: number; averageSeconds: number | null; intervalSeconds: number | null; targetSeconds: number | null };
type Response = { success: boolean; period: string; points: Point[]; rollingIntervals: number; truncated: boolean; observedAt: string;
  nodeHeight: number; indexedHeight: number | null; schedule: { nu7Height: number | null } | null };

export function BlockTimeChart() {
  const [period, setPeriod] = useState('24h');
  const [individual, setIndividual] = useState(false);
  const { data, loading, error } = useApiQuery<Response>('/api/network/block-time', { period }, { refreshInterval: 15_000 });
  const points = data?.period === period ? data.points : [];
  const latest = points.at(-1);
  const activation = data?.schedule?.nu7Height;
  const showActivation = activation != null && points.length > 0 && activation >= points[0].height && activation <= points[points.length - 1].height;
  return <ChartCard title="Block time" controls={<div className="flex gap-2" aria-label="Block time period">
    {['6h', '24h', '7d'].map(value => <button key={value} type="button" aria-pressed={period === value}
      className={`px-3 py-1 rounded text-xs font-mono ${period === value ? 'bg-cipher-border text-primary' : 'text-muted'}`}
      onClick={() => setPeriod(value)}>{value}</button>)}
  </div>}>
    <p className="text-sm text-muted mb-3">{latest?.averageSeconds != null ? `${latest.averageSeconds.toFixed(1)}s observed` : 'Observed average unavailable'}
      {' · '}{latest?.targetSeconds != null ? `${latest.targetSeconds}s target` : 'Target unavailable'}</p>
    {points.length ? <ResponsiveContainer width="100%" height={270}>
      <LineChart data={points} margin={{ top: 12, right: 12, bottom: 12, left: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--color-cipher-border)" />
        <XAxis dataKey="height" type="number" domain={['dataMin', 'dataMax']} tickFormatter={v => Number(v).toLocaleString()} minTickGap={55} />
        <YAxis width={48} unit="s" />
        <Tooltip labelFormatter={height => `Block ${Number(height).toLocaleString()}`} />
        {individual && <Line dataKey="intervalSeconds" name="Sampled block interval (s)" stroke="var(--color-muted)" dot={false} strokeWidth={1} isAnimationActive={false} connectNulls={false} />}
        <Line dataKey="averageSeconds" name="120-interval average (s)" stroke="var(--color-cipher-yellow)" dot={false} strokeWidth={2} isAnimationActive={false} connectNulls={false} />
        <Line dataKey="targetSeconds" name="Consensus target (s)" type="stepAfter" stroke="var(--color-secondary)" strokeDasharray="5 5" dot={false} isAnimationActive={false} connectNulls={false} />
        {showActivation && <ReferenceLine x={activation} stroke="var(--color-cipher-yellow)" label="NU7" />}
      </LineChart>
    </ResponsiveContainer> : <p role="status" className="py-20 text-center text-muted">{loading ? 'Loading block intervals…' : 'Block time observations unavailable.'}</p>}
    <label className="flex items-center gap-2 text-xs text-muted mb-3"><input type="checkbox" checked={individual} onChange={event => setIndividual(event.target.checked)} />Show sampled individual intervals</label>
    <p className="text-xs text-muted">Average over 120 consecutive block-header intervals. The target changes at activation; observed timing settles gradually. Header timestamps can move backwards. Heights are shown on the horizontal axis.</p>
    {data?.schedule?.nu7Height == null && <p className="text-xs text-muted mt-2">The serving node has not announced an NU7 activation height.</p>}
    {data?.truncated && <p role="status" className="text-xs text-warning mt-2">Showing the latest bounded sample; earlier observations in this period are omitted.</p>}
    {(error || (data?.indexedHeight != null && data.nodeHeight > data.indexedHeight)) && <p role="status" className="text-xs text-warning mt-2">{error ? 'Refresh unavailable. Any displayed observations are from the previous response.' : `Sample is ${data!.nodeHeight - data!.indexedHeight!} blocks behind the node.`}</p>}
  </ChartCard>;
}
