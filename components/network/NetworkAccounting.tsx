'use client';
import Link from 'next/link';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { CURRENCY } from '@/lib/config';
import { useApiQuery } from '@/hooks/useApiQuery';
import { Card, CardBody } from '@/components/ui/Card';

type Accounting = { success: boolean; nodeHeight: number; nsmBalanceZat: number | string | null; observedAt: string;
  block: { height: number; feesPaidZat: number | string | null; feesToNsmZat: number | string | null; minerFeeAllocationZat: number | string | null;
    minerSubsidyZat: number | string | null; minerReceiptsZat: number | string | null; reissuanceZat: number | string | null; feeRule?: string } | null };

function zec(value: number | string | null | undefined) {
  if (value == null) return 'Unavailable';
  const n = BigInt(value); const abs = n < BigInt(0) ? -n : n;
  return `${n < BigInt(0) ? '-' : ''}${(abs / BigInt(100000000)).toLocaleString('en-US')}.${String(abs % BigInt(100000000)).padStart(8, '0')} ${CURRENCY}`;
}

export function NetworkAccounting() {
  const { data, loading, error } = useApiQuery<Accounting>('/v1/network/accounting', undefined, { refreshInterval: 30_000 });
  const block = data?.block;
  const nu7Active = block?.feeRule === 'floor(aggregate-block-fees * 3 / 5)';
  return <Card className="card-static"><CardBody>
    <SectionHeader label="BLOCK_ACCOUNTING" />
    <p className="text-caption text-muted mb-5">{block ? <Link href={`/block/${block.height}`} className="text-secondary hover:text-cipher-gold">Canonical block #{block.height.toLocaleString()} →</Link> : loading ? 'Loading block accounting…' : 'Block accounting unavailable.'}</p>
    <dl className="divide-y divide-cipher-border text-sm">
      {([
        ['Transaction fees paid', block?.feesPaidZat],
        ['Miner subsidy allocation', block?.minerSubsidyZat],
        ['Actual miner receipts', block?.minerReceiptsZat],
        ...(nu7Active ? [
          ['Minimum fee removal', block?.feesToNsmZat],
          ['NSM balance', data?.nsmBalanceZat],
          ...(block?.reissuanceZat != null ? [['Reissuance', block.reissuanceZat]] : []),
        ] as const : []),
      ] as ReadonlyArray<readonly [string, number | string | null | undefined]>).map(([label, value]) => <div key={label} className="flex justify-between flex-wrap gap-x-4 gap-y-1 py-3 first:pt-0 last:pb-0"><dt className="text-muted">{label}</dt><dd className="font-mono text-primary tabular-nums break-all">{zec(value)}</dd></div>)}
    </dl>
    {error && <p role="status" className="text-caption text-warning mt-2">Accounting refresh unavailable. Any displayed values are from the previous response.</p>}
  </CardBody></Card>;
}
