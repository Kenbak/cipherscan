'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getApiUrl } from '@/lib/api-config';
import { PageHeader, SectionHeader } from '@/components/ui';
import { PageSectionNav } from '@/components/PageSectionNav';
import { PoolDistributionChart } from '@/components/network/PoolDistributionChart';
import { FlowVolumeChart } from '@/components/pools/FlowVolumeChart';
import { FlowLegend } from '@/components/pools/FlowLegend';
import {
  PoolOverviewHero,
  PoolOverviewSkeleton,
  type PoolOverviewData,
} from '@/components/pools/PoolOverviewHero';
import { Card, CardBody } from '@/components/ui/Card';
import { DataTable } from '@/components/ui';
import { ShieldFlowBadge } from '@/components/ShieldFlowBadge';

const SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'supply', label: 'Supply' },
  { id: 'flows', label: 'Flows' },
] as const;

interface RecentFlow {
  txid: string;
  flowType: string;
  amountZec: number;
  pool: string;
  blockTime: number;
}

function formatTimeAgo(unixSec: number): string {
  const diff = Math.max(0, Math.floor(Date.now() / 1000 - unixSec));
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function TurnstileLinkCard() {
  return (
    <Link
      href="/turnstile"
      className="group flex items-center justify-between gap-4 rounded-2xl border border-cipher-border bg-cipher-surface p-5 sm:p-6 transition-colors hover:border-cipher-cyan/30"
    >
      <div>
        <p className="text-sm font-semibold text-primary group-hover:text-primary transition-colors">
          Turnstile Tracker
        </p>
        <p className="mt-1 max-w-xl text-xs leading-relaxed text-secondary font-sans">
          When ZEC leaves a shielded pool, where does it go — held transparent, reshielded, exchanged, or moved
          elsewhere?
        </p>
      </div>
      <span className="shrink-0 text-[10px] font-mono text-cipher-cyan">Open →</span>
    </Link>
  );
}

function RecentLargeFlows() {
  const [flows, setFlows] = useState<RecentFlow[]>([]);

  useEffect(() => {
    fetch(`${getApiUrl()}/api/shielded/list?limit=10&min_zec=10`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.flows) setFlows(data.flows);
        else if (data?.data) setFlows(data.data);
      })
      .catch(() => {});
  }, []);

  if (flows.length === 0) return null;

  return (
    <Card variant="glass">
      <CardBody>
        <SectionHeader
          label="RECENT_LARGE_FLOWS"
          actions={
            <Link href="/txs?type=shielded" className="text-[10px] font-mono text-cipher-cyan hover:underline">
              View all →
            </Link>
          }
        />
        <DataTable
          bare
          columns={[
            {
              id: 'type',
              header: 'Type',
              cell: (f: RecentFlow) => (
                <ShieldFlowBadge type={f.flowType === 'shield' ? 'shielding' : 'unshielding'} variant="full" />
              ),
            },
            {
              id: 'pool',
              header: 'Pool',
              cell: (f) => <span className="font-mono text-xs text-muted capitalize">{f.pool}</span>,
            },
            {
              id: 'amount',
              header: 'Amount',
              align: 'right',
              cell: (f) => (
                <span className="font-mono text-xs tabular-nums text-primary">
                  {(f.amountZec || 0).toFixed(2)} ZEC
                </span>
              ),
            },
            {
              id: 'time',
              header: 'Time',
              align: 'right',
              cell: (f) => (
                <span className="font-mono text-xs text-muted">
                  {f.blockTime ? formatTimeAgo(f.blockTime) : '—'}
                </span>
              ),
            },
          ]}
          rows={flows}
          rowKey={(f, i) => `${f.txid}-${i}`}
        />
        <FlowLegend className="mt-4 border-t border-glass-4 pt-4" />
      </CardBody>
    </Card>
  );
}

export default function PoolsPage() {
  const [overview, setOverview] = useState<PoolOverviewData | null>(null);

  useEffect(() => {
    fetch(`${getApiUrl()}/api/pools/overview`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.current) setOverview(data);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      <PageHeader
        eyebrow="POOL_ANALYTICS"
        title="Zcash Shielded Pools"
        subtitle="Track how ZEC moves between transparent and shielded pools. Where it goes, and whether it stays."
      />

      <PageSectionNav sections={SECTIONS} ariaLabel="Pool analytics sections" className="mb-10" />

      <section id="overview" className="scroll-mt-36 mb-14">
        {overview ? <PoolOverviewHero data={overview} /> : <PoolOverviewSkeleton />}
      </section>

      <section id="supply" className="scroll-mt-36 mb-14">
        <PoolDistributionChart />
      </section>

      <section id="flows" className="scroll-mt-36 mb-14">
        <FlowVolumeChart />
      </section>

      <section className="mb-14">
        <TurnstileLinkCard />
      </section>

      <section className="mb-14">
        <RecentLargeFlows />
      </section>
    </div>
  );
}
