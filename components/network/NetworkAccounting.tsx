'use client';
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

export function NetworkAccounting() {
  const { data, loading, error } = useApiQuery<Accounting>('/api/network/accounting', undefined, { refreshInterval: 30_000 });
  const block = data?.block;
  return <Card><CardBody>
    <h2 className="text-sm font-mono text-primary mb-3">Fees, miner receipts &amp; NSM</h2>
    <p className="text-sm text-muted mb-4">{block ? `Canonical block ${block.height.toLocaleString()}` : loading ? 'Loading block accounting…' : 'Block accounting unavailable.'}</p>
    <dl className="space-y-3 text-sm">
      {([
        ['Transaction fees paid', block?.feesPaidZat], ['Fees allocated to miners', block?.minerFeeAllocationZat],
        ['Fees removed into NSM', block?.feesToNsmZat], ['Miner subsidy allocation', block?.minerSubsidyZat],
        ['Actual miner receipts', block?.minerReceiptsZat], ['Separate reissuance amount', block?.reissuanceZat],
        ['NSM reserve balance', data?.nsmBalanceZat],
      ] as const).map(([label, value]) => <div key={label} className="flex justify-between flex-wrap gap-2"><dt className="text-muted">{label}</dt><dd className="font-mono text-primary">{zec(value)}</dd></div>)}
    </dl>
    <p className="text-xs text-muted mt-4">NU7 redirects 60% of aggregate block fees into NSM, rounded down once per block. Miner receipts exclude funding and founders’ payouts. The node’s signed NSM reserve counter is separate from circulating supply; the RPC does not separately report reissuance.</p>
    {data && <p className="text-xs text-muted mt-2">Reserve observed at node height {data.nodeHeight.toLocaleString()}. Block accounting can lag behind that observation.</p>}
    {error && <p role="status" className="text-xs text-warning mt-2">Accounting refresh unavailable. Any displayed values are from the previous response.</p>}
  </CardBody></Card>;
}
