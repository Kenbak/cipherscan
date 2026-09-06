'use client';

import { useEffect, useState, lazy, Suspense } from 'react';
import Link from 'next/link';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useApiQuery } from '@/hooks/useApiQuery';
import { Card, CardBody } from '@/components/ui/Card';
import { PageHeader, SectionHeader } from '@/components/ui/SectionHeader';
import { MetricCard } from '@/components/ui/MetricCard';
import { isCrosslink } from '@/lib/config';
import { formatHashrate } from '@/lib/format-numbers';
import { blockAgeLabel, observationStatus } from '@/lib/network-overview';
import { NetworkSectionNav } from '@/components/network/NetworkSectionNav';
import { BlockCadenceChart } from '@/components/network/BlockCadenceChart';
import { FeeDistributionChart, type FeeDistributionResponse } from '@/components/network/FeeDistributionChart';
import type { NodeLocationsResponse, NodeStatsResponse } from '@/components/NodeMap';
import type { RecentBlocksResponse } from '@/components/network/RecentBlocksTable';
const NodeMap = lazy(() => import('@/components/NodeMap'));
const BlockActivityChart = lazy(() => import('@/components/BlockActivityChart').then(m => ({ default: m.BlockActivityChart })));
const NetworkHistoryCharts = lazy(() => import('@/components/network/NetworkHistoryCharts').then(m => ({ default: m.NetworkHistoryCharts })));
const ProtocolStatsChart = lazy(() => import('@/components/network/ProtocolStatsChart').then(m => ({ default: m.ProtocolStatsChart })));

export interface NetworkStats {
  success: boolean;
  mining: {
    networkHashrate: string;
    networkHashrateRaw: number;
    difficulty: number;
    avgBlockTime: number;
    blocks24h: number;
    blockReward: number;
    minerReward: number;
    fundingStreams: number;
    lockbox: number;
    dailyRevenue: number;
    dailyMinerRevenue: number;
  };
  network: {
    peers: number;
    height: number;
    protocolVersion: number;
    subversion: string;
  };
  blockchain: {
    height: number;
    latestBlockTime: number;
    syncProgress: number;
    sizeBytes: number;
    sizeGB: number;
    tx24h: number;
    tx24hExclCoinbase?: number;
  };
  supply?: {
    chainSupply: number;
    transparent: number;
    sprout: number;
    sapling: number;
    orchard: number;
    ironwood: number;
    lockbox: number;
    totalShielded: number;
    shieldedPercentage: number;
    sizeOnDisk: number;
    activeUpgrade: string | null;
    chain: string;
  };
  cached?: boolean;
  cacheAge?: number;
}

export interface HealthStatus {
  success: boolean;
  zebra: {
    healthy: boolean;
    ready: boolean;
  };
}


export interface NetworkPageInitialData {
  fetchedAt: number;
  stats: NetworkStats | null;
  health: HealthStatus | null;
  nodeLocations: NodeLocationsResponse | null;
  nodeStats: NodeStatsResponse | null;
  recentBlocks: RecentBlocksResponse | null;
  feeDistribution: FeeDistributionResponse | null;
}

export default function NetworkClient({ initialData }: { initialData: NetworkPageInitialData }) {
  const statsQuery = useApiQuery<NetworkStats>('/api/network/stats', undefined, {
    refreshInterval: 60_000, initialData: initialData.stats ?? undefined, initialFetchedAt: initialData.fetchedAt,
  });
  const healthQuery = useApiQuery<HealthStatus>('/api/network/health', undefined, {
    refreshInterval: 60_000, initialData: initialData.health ?? undefined, initialFetchedAt: initialData.fetchedAt,
  });
  const [streamStats, setStreamStats] = useState<NetworkStats | null>(null);
  const [now, setNow] = useState(initialData.fetchedAt);
  const [technicalOpen, setTechnicalOpen] = useState(false);
  const stats = streamStats ?? (statsQuery.data?.success ? statsQuery.data : null);
  useWebSocket({ onMessage: message => {
    if (message.type === 'network_stats' && message.data?.success && message.data?.blockchain) setStreamStats(message.data);
  }});
  useEffect(() => { setStreamStats(null); }, [statsQuery.data]);
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const reveal = () => {
      if (['#network-technical', '#chain-size', '#protocol-growth'].includes(window.location.hash)) setTechnicalOpen(true);
    };
    reveal();
    window.addEventListener('hashchange', reveal);
    return () => window.removeEventListener('hashchange', reveal);
  }, []);
  useEffect(() => {
    if (!technicalOpen) return;
    const id = window.location.hash.slice(1);
    if (['network-technical', 'chain-size', 'protocol-growth'].includes(id)) {
      document.getElementById(id)?.scrollIntoView({ block: 'start' });
    }
  }, [technicalOpen]);
  const height = stats?.blockchain.height ?? stats?.network.height;
  const txCount = stats?.blockchain.tx24hExclCoinbase ?? stats?.blockchain.tx24h;
  const nodeStatus = observationStatus(healthQuery.error ? null : healthQuery.data?.zebra);

  return (
    <div className="network-page max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      <PageHeader eyebrow="NETWORK_STATUS" title="Zcash Network"
        subtitle="Block production, transaction activity and the nodes we observe." />
      <NetworkSectionNav onTechnicalNavigate={() => setTechnicalOpen(true)} />
      <section id="network-overview" className="network-section mb-8" aria-label="Current chain activity">
        {statsQuery.error && <p role="status" className="text-caption text-warning mb-3">Network summary could not refresh. {stats ? 'Last received values are shown.' : 'Other observations remain available below.'}</p>}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MetricCard label="Latest block" value={height != null ? <Link href={`/block/${height}`} className="hover:text-cipher-gold">{height.toLocaleString()}</Link> : '—'}
            hint={stats ? `Block timestamp · ${blockAgeLabel(stats.blockchain.latestBlockTime, now)}` : 'Awaiting chain data'} />
          <MetricCard label="Block interval" value={stats ? `${stats.mining.avgBlockTime.toFixed(1)}s` : '—'} hint="Rolling average · target 75s" />
          <MetricCard label="Transactions · 24h" value={txCount?.toLocaleString() ?? '—'}
            hint={stats?.blockchain.tx24hExclCoinbase != null ? 'Confirmed · coinbase excluded' : 'Confirmed · includes coinbase'} />
          <MetricCard label="Network hashrate" value={stats ? formatHashrate(stats.mining.networkHashrateRaw) : '—'}
            hint={<Link href="/mining#metrics" className="hover:text-primary underline underline-offset-4">Estimated mining power →</Link>} />
        </div>
      </section>

      <section id="network-nodes" className="network-section mb-10" aria-label="Observed node distribution">
        <Suspense fallback={<div className="card h-80 flex items-center justify-center text-muted text-sm">Loading node observations…</div>}>
          {isCrosslink ? <BlockActivityChart limit={80} /> : <NodeMap initialLocations={initialData.nodeLocations} initialStats={initialData.nodeStats} />}
        </Suspense>
      </section>

      <section id="network-activity" className="network-section mb-10" aria-label="Block cadence and observed fees">
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 items-stretch">
          <BlockCadenceChart initialData={initialData.recentBlocks} initialFetchedAt={initialData.fetchedAt} chainHeight={height} now={now} />
          <div id="network-fees" className="network-section h-full"><FeeDistributionChart initialData={initialData.feeDistribution} /></div>
        </div>
      </section>

      <section id="network-protocol" className="network-section mb-10">
        <SectionHeader label="PROTOCOL_REFERENCE" />
        <dl className="grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-5 border-y border-cipher-border py-5">
          {[
            ['Active upgrade', stats?.supply?.activeUpgrade ?? '—'],
            ['Block subsidy', stats ? `${stats.mining.blockReward} ZEC` : '—'],
            ['Maximum supply', '21,000,000 ZEC'],
            ['Target spacing', '75 seconds'],
          ].map(([label, value]) => <div key={label}><dt className="text-caption text-muted mb-1">{label}</dt><dd className="font-mono text-sm text-primary tabular-nums">{value}</dd></div>)}
        </dl>
        <div className="flex flex-wrap gap-x-6 gap-y-3 mt-4 text-caption font-mono">
          <Link href="/mining#issuance" className="text-secondary hover:text-cipher-gold">Rewards &amp; next halving →</Link>
          <Link href="/pools#supply" className="text-secondary hover:text-cipher-gold">Supply &amp; shielded pools →</Link>
          <Link href="/rich-list#transparent-breakdown" className="text-secondary hover:text-cipher-gold">Transparent balance groups →</Link>
        </div>
      </section>

      <details id="network-technical" className="network-section border-y border-cipher-border py-5" open={technicalOpen} onToggle={event => setTechnicalOpen(event.currentTarget.open)}>
        <summary className="cursor-pointer font-mono text-sm text-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cipher-gold">Technical details <span className="block sm:inline sm:ml-3 text-caption font-sans text-muted">Storage, shielded protocol growth and this explorer’s node</span></summary>
        {technicalOpen && <div className="pt-6 space-y-5">
          <Card><CardBody>
            <SectionHeader label="EXPLORER_NODE" />
            <p className="text-caption text-muted mb-4">This is one observation point, not a network-wide health verdict.</p>
            <dl className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-sm font-mono">
              <div><dt className="text-caption text-muted">Node readiness</dt><dd className={nodeStatus === 'Ready' ? 'text-cipher-green' : nodeStatus === 'Unavailable' ? 'text-muted' : 'text-warning'}>{nodeStatus}</dd></div>
              <div><dt className="text-caption text-muted">Connected peers</dt><dd>{stats?.network.peers ?? '—'}</dd></div>
              <div><dt className="text-caption text-muted">Reported software</dt><dd className="break-all">{stats?.network.subversion?.replace(/^\/|\/$/g, '') ?? '—'}</dd></div>
              <div><dt className="text-caption text-muted">Node disk usage</dt><dd>{stats ? `${stats.blockchain.sizeGB.toFixed(2)} GiB` : '—'}</dd></div>
            </dl>
          </CardBody></Card>
          <Suspense fallback={<p className="text-muted text-sm">Loading technical charts…</p>}>
            <div id="chain-size" className="network-section"><NetworkHistoryCharts /></div>
            <div id="protocol-growth" className="network-section"><ProtocolStatsChart /></div>
          </Suspense>
        </div>}
      </details>
    </div>
  );
}
