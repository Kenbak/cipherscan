'use client';
import { Skeleton } from '@/components/ui/Skeleton';

import { useApiQuery } from '@/hooks/useApiQuery';
import { Card, CardBody } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { HalvingPanel, type HalvingInfo } from './HalvingPanel';

export function MiningIssuance() {
  const { data, loading, error } = useApiQuery<HalvingInfo & { success: boolean }>('/v1/network/halving', undefined, { refreshInterval: 300_000 });
  const emission = useApiQuery<{ success: boolean; dailyEmissionEstimate: number | null }>('/v1/network/emission');
  const halving = data ? data : null;
  return <section id="issuance" className="network-section mb-6">
    <SectionHeader label="ISSUANCE" />
    <div className="grid md:grid-cols-2 gap-5">
      {halving ? <HalvingPanel halving={halving} /> : loading ? <Card><CardBody><p className="text-sm font-mono text-primary mb-5">Next halving</p><Skeleton className="h-10 w-48 mx-auto mb-3" /><Skeleton className="h-4 w-32 mx-auto mb-6" /><Skeleton className="h-2.5 w-full mb-6" /><div className="space-y-4">{[0,1,2,3,4].map(i => <div key={i} className="flex justify-between gap-4"><Skeleton className="h-4 w-36" /><Skeleton className="h-4 w-24" /></div>)}</div></CardBody></Card> : <Card><CardBody><p className="text-sm text-muted">{loading ? 'Loading halving observations…' : 'Halving observations are unavailable.'}</p></CardBody></Card>}
      <Card><CardBody>
        <h3 className="font-mono text-sm text-primary mb-3">Block subsidy &amp; miner allocation</h3>
        <p className="text-sm text-secondary mb-6">Newly issued ZEC is split between miners and the funding allocations active at the current height. Transaction fees are separate.</p>
        <dl className="space-y-4 text-sm">
          {[
            ['Total block subsidy', halving?.currentSubsidy],
            ['Current miner allocation', halving?.minerReward],
            ['Miner allocation after halving', halving?.nextMinerReward],
            ['Estimated daily issuance', emission.data ? emission.data.dailyEmissionEstimate : null],
          ].map(([label, value]) => <div key={label} className="flex flex-wrap justify-between gap-2 border-b border-cipher-border pb-3"><dt className="text-muted">{label}</dt><dd className="font-mono text-primary tabular-nums">{value != null ? `${value} ZEC` : '—'}</dd></div>)}
        </dl>
        <p className="text-caption text-muted mt-5">Daily issuance assumes 1,152 blocks at the current subsidy. Halving dates are estimates based on recent block intervals. The activation height determines the subsidy change.</p>
      </CardBody></Card>
    </div>
    {error && halving && <p role="status" className="text-caption text-warning mt-3">Could not refresh issuance data. Last received values are shown.</p>}
  </section>;
}
