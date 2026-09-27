'use client';
import { useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { CURRENCY } from '@/lib/config';
import { useApiQuery } from '@/hooks/useApiQuery';
import { Card, CardBody } from '@/components/ui/Card';

type Accounting = { success: boolean; nodeHeight: number; nsmBalanceZat: number | string | null; observedAt: string;
  block: { height: number; feesPaidZat: number | string | null; feesToNsmZat: number | string | null; minerFeeAllocationZat: number | string | null;
    minerSubsidyZat: number | string | null; minerReceiptsZat: number | string | null; reissuanceZat: number | string | null } | null };

function zec(value: number | string | null | undefined) {
  if (value == null) return 'Unavailable';
  const n = BigInt(value); const abs = n < BigInt(0) ? -n : n;
  return `${n < BigInt(0) ? '-' : ''}${(abs / BigInt(100000000)).toLocaleString('en-US')}.${String(abs % BigInt(100000000)).padStart(8, '0')} ${CURRENCY}`;
}

type HistoryPoint = { height: number; feesPaidZat: string | null; feesToNsmZat: string | null;
  minerFeeAllocationZat: string | null; minerReceiptsZat: string | null; nsmBalanceZat: string | null };
type History = { points: HistoryPoint[]; coverage: { blocks: number; feeBlocks: number; nsmSamples: number }; nodeHeight: number; indexedHeight: number | null };
const historySeries = {
  fees: [ ['feesPaidZat', 'Fees paid', 'var(--color-cipher-yellow)'], ['feesToNsmZat', 'Required removal', 'var(--color-secondary)'], ['minerFeeAllocationZat', 'Maximum miner fee allocation', 'var(--color-muted)'] ],
  reserve: [ ['nsmBalanceZat', 'NSM reserve', 'var(--color-cipher-yellow)'] ],
  receipts: [ ['minerReceiptsZat', 'Miner receipts', 'var(--color-cipher-yellow)'] ],
} as const;

export function NetworkAccounting() {
  const { data, loading, error } = useApiQuery<Accounting>('/api/network/accounting', undefined, { refreshInterval: 30_000 });
  const block = data?.block;
  const [metric, setMetric] = useState<keyof typeof historySeries>('fees');
  const history = useApiQuery<History>('/api/network/accounting/history', { limit: 120 }, { refreshInterval: 15_000 });
  const points = (history.data?.points ?? []).flatMap((point, i, all) => {
    const plotted = { ...point, ...Object.fromEntries(Object.entries(point).filter(([key]) => key.endsWith('Zat'))
      .map(([key, value]) => [key + 'Display', value === null ? null : Number(value) / 1e8])) };
    // Explicit gaps prevent a curve from bridging an incomplete indexed range.
    return i > 0 && all[i - 1].height + 1 !== point.height
      ? [{ height: all[i - 1].height + 1 }, plotted] : [plotted];
  });
  const series = historySeries[metric];
  const hasValues = history.data?.points.some(point => series.some(([key]) => point[key] !== null));
  return <Card><CardBody>
    <h2 className="text-sm font-mono text-primary mb-3">Fees, miner receipts &amp; NSM</h2>
    <p className="text-sm text-muted mb-4">{block ? `Canonical block ${block.height.toLocaleString()}` : loading ? 'Loading block accounting…' : 'Block accounting unavailable.'}</p>
    <dl className="space-y-3 text-sm">
      {([
        ['Transaction fees paid', block?.feesPaidZat], ['Maximum miner fee allocation', block?.minerFeeAllocationZat],
        ['Required fee removal (minimum)', block?.feesToNsmZat], ['Miner subsidy allocation', block?.minerSubsidyZat],
        ['Actual miner receipts', block?.minerReceiptsZat], ['Separate reissuance amount', block?.reissuanceZat],
        ['NSM reserve balance', data?.nsmBalanceZat],
      ] as const).map(([label, value]) => <div key={label} className="flex justify-between flex-wrap gap-2"><dt className="text-muted">{label}</dt><dd className="font-mono text-primary">{zec(value)}</dd></div>)}
    </dl>
    <p className="text-xs text-muted mt-4">NU7 requires at least 60% of aggregate block fees to be removed, rounded down once per block. The allocation shown is that minimum; total removals for this block are unavailable. Miner receipts exclude funding and founders’ payouts. The node’s signed NSM reserve counter is separate from circulating supply; the RPC does not separately report reissuance.</p>
    {data && <p className="text-xs text-muted mt-2">Reserve observed at node height {data.nodeHeight.toLocaleString()}. Block accounting can lag behind that observation.</p>}
    <div className="border-t border-cipher-border mt-6 pt-5">
      <h3 className="text-sm font-mono text-primary mb-3">Accounting history</h3>
      <div className="flex flex-wrap gap-2 mb-3" aria-label="Accounting history metric">
        {(['fees', 'reserve', 'receipts'] as const).map(key => <button type="button" key={key} aria-pressed={metric === key}
          className={`px-3 py-1 rounded text-xs font-mono ${metric === key ? 'bg-cipher-border text-primary' : 'text-muted'}`}
          onClick={() => setMetric(key)}>{({ fees: 'Fee allocation', reserve: 'NSM reserve', receipts: 'Miner receipts' })[key]}</button>)}
      </div>
      {hasValues ? <ResponsiveContainer width="100%" height={240}>
        <LineChart data={points} margin={{ top: 8, right: 28, bottom: 12, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--color-cipher-border)" />
          <XAxis dataKey="height" type="number" domain={['dataMin', 'dataMax']} tickFormatter={v => Number(v).toLocaleString()} minTickGap={55} />
          <YAxis width={70} domain={['auto', 'auto']} tickFormatter={v => Number(v).toLocaleString('en-US', { maximumSignificantDigits: 5 })} />
          <Tooltip labelFormatter={height => `Block ${Number(height).toLocaleString()}`}
            formatter={(_value, name, item) => {
              const key = String(item.dataKey).replace(/Display$/, '');
              return [zec(item.payload[key]), name];
            }} />
          {series.map(([key, name, color]) => <Line key={key} dataKey={key + 'Display'} name={name} stroke={color}
            dot={{ r: 2 }} connectNulls={false} isAnimationActive={false} strokeWidth={2} />)}
        </LineChart>
      </ResponsiveContainer> : <p role="status" className="py-12 text-center text-muted">{history.loading ? 'Loading accounting history…' : 'No accounting history available for this metric yet.'}</p>}
      {hasValues && <ul className="flex flex-wrap gap-4 mb-3 text-xs text-muted" aria-label="Chart legend">
        {series.map(([key, name, color]) => <li key={key} className="flex items-center gap-2"><span aria-hidden="true" className="inline-block w-3 h-0.5" style={{ backgroundColor: color }} />{name}</li>)}
      </ul>}
      <p className="text-xs text-muted">Latest 120 indexed blocks; vertical values in {CURRENCY}. Hover for exact amounts. Reserve and miner-receipt samples begin when collection is enabled. Missing samples remain gaps. The reserve can start with an existing balance; it is not a cumulative fee total.</p>
      {history.data && <p className="text-xs text-muted mt-2">{history.data.coverage.feeBlocks} complete fee blocks · {history.data.coverage.nsmSamples} reserve samples out of {history.data.coverage.blocks} blocks.</p>}
      {(history.error || (history.data?.indexedHeight != null && history.data.nodeHeight > history.data.indexedHeight)) && <p role="status" className="text-xs text-warning mt-2">{history.error ? 'History refresh unavailable. Displayed data may be stale.' : `History is ${history.data!.nodeHeight - history.data!.indexedHeight!} blocks behind the node.`}</p>}
    </div>
    {error && <p role="status" className="text-xs text-warning mt-2">Accounting refresh unavailable. Any displayed values are from the previous response.</p>}
  </CardBody></Card>;
}
