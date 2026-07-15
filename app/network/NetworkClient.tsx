'use client';

import { useEffect, useState, lazy, Suspense, type ReactNode } from 'react';
import Link from 'next/link';
import { useWebSocket } from '@/hooks/useWebSocket';
import { getApiUrl, API_CONFIG } from '@/lib/api-config';
import { Card, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { isCrosslink } from '@/lib/config';

import { formatHashrate } from '@/lib/format-numbers';
import { NetworkSectionNav } from '@/components/network/NetworkSectionNav';
const NodeMap = lazy(() => import('@/components/NodeMap'));
const BlockActivityChart = lazy(() =>
  import('@/components/BlockActivityChart').then((m) => ({ default: m.BlockActivityChart }))
);
const HalvingPanel = lazy(() => import('@/components/network/HalvingPanel').then((m) => ({ default: m.HalvingPanel })));
const SupplyEmissionPanel = lazy(() => import('@/components/network/HalvingPanel').then((m) => ({ default: m.SupplyEmissionPanel })));
const PoolDistributionChart = lazy(() => import('@/components/network/PoolDistributionChart').then((m) => ({ default: m.PoolDistributionChart })));
const NetworkHistoryCharts = lazy(() => import('@/components/network/NetworkHistoryCharts').then((m) => ({ default: m.NetworkHistoryCharts })));
const FeeDistributionChart = lazy(() => import('@/components/network/FeeDistributionChart').then((m) => ({ default: m.FeeDistributionChart })));
const ProtocolStatsChart = lazy(() => import('@/components/network/ProtocolStatsChart').then((m) => ({ default: m.ProtocolStatsChart })));
const RecentBlocksTable = lazy(() => import('@/components/network/RecentBlocksTable').then((m) => ({ default: m.RecentBlocksTable })));

const UPGRADE_URLS: Record<string, string> = {
  'NU6': 'https://z.cash/upgrade/nu6/',
  'NU6.1': 'https://z.cash/upgrade/nu6-1/',
  'NU5': 'https://z.cash/upgrade/nu5/',
  'Canopy': 'https://z.cash/upgrade/canopy/',
  'Heartwood': 'https://z.cash/upgrade/heartwood/',
  'Blossom': 'https://z.cash/upgrade/blossom/',
  'Sapling': 'https://z.cash/upgrade/sapling/',
};

function getUpgradeUrl(name: string | null): string | undefined {
  if (!name) return undefined;
  return UPGRADE_URLS[name];
}

// Format hashrate with appropriate unit — see lib/format-numbers.ts

interface HalvingInfo {
  halvingBlock: number | null;
  blocksRemaining: number | null;
  eraProgress?: number;
  currentSubsidy: number;
  nextSubsidy: number | null;
  minerReward: number;
  nextMinerReward: number | null;
  estimatedDate: string | null;
  estimatedSeconds: number | null;
}

interface EmissionInfo {
  circulating: number;
  remaining: number;
  circulatingPct: number;
  dailyEmissionEstimate: number | null;
}

interface NetworkStats {
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

interface HealthStatus {
  success: boolean;
  zebra: {
    healthy: boolean;
    ready: boolean;
  };
}

export default function NetworkClient() {
  const [stats, setStats] = useState<NetworkStats | null>(null);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previousStats, setPreviousStats] = useState<NetworkStats | null>(null);
  const [zecPrice, setZecPrice] = useState<number | null>(null);
  const [breakdown, setBreakdown] = useState<{ categories: { category: string; addressCount: number; totalBalance: number; percentage: number }[]; addressTypes?: { type: string; description: string; addressCount: number; totalBalance: number; percentage: number }[]; transparentTotal: number; labeledTotal: number; labeledPercentage: number } | null>(null);
  const [halving, setHalving] = useState<HalvingInfo | null>(null);
  const [emission, setEmission] = useState<EmissionInfo | null>(null);
  const [breakdownOpen, setBreakdownOpen] = useState(false);

  // WebSocket for real-time updates
  const { isConnected } = useWebSocket({
    onMessage: (data) => {
      if (data.type === 'network_stats') {
        setPreviousStats(stats);
        setStats(data.data);
        setLoading(false);
      }
    },
  });

  const fetchData = async () => {
    try {
      const apiUrl = getApiUrl();

      // Load stats first (critical path) — don't wait for health/price
      const statsRes = await fetch(`${apiUrl}/api/network/stats`);
      if (!statsRes.ok) throw new Error('Failed to fetch network data');
      const statsData = await statsRes.json();
      setPreviousStats(stats);
      setStats(statsData);
      setError(null);
      setLoading(false);

      // Load health + price in background (non-blocking)
      fetch(`${apiUrl}/api/network/health`)
        .then(r => r.ok ? r.json() : null)
        .then(data => { if (data) setHealth(data); })
        .catch(() => {});

      fetch(`${API_CONFIG.POSTGRES_API_URL}/api/price`)
        .then(r => r.ok ? r.json() : null)
        .then(data => { if (data?.price) setZecPrice(data.price); })
        .catch(() => {});

      fetch(`${apiUrl}/api/supply/transparent-breakdown`)
        .then(r => r.ok ? r.json() : null)
        .then(data => { if (data?.success) setBreakdown(data); })
        .catch(() => {});

      fetch(`${apiUrl}/api/network/halving`)
        .then(r => r.ok ? r.json() : null)
        .then(data => { if (data?.success) setHalving(data); })
        .catch(() => {});

      fetch(`${apiUrl}/api/network/emission?period=1y`)
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (data?.success) {
            setEmission({
              circulating: data.circulating,
              remaining: data.remaining,
              circulatingPct: data.circulatingPct,
              dailyEmissionEstimate: data.dailyEmissionEstimate,
            });
          }
        })
        .catch(() => {});
    } catch (err: any) {
      console.error('Error fetching network data:', err);
      setError(err.message || 'Failed to load network data');
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    // Real heading instead of skeleton bars so the server-rendered loading
    // state still carries the page's H1 and intro (matters for SEO).
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div className="mb-8">
          <p className="text-xs text-muted font-mono uppercase tracking-widest mb-3">
            <span className="opacity-50">{'>'}</span> NETWORK_STATUS
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold text-primary">
            Network Overview
          </h1>
          <p className="text-sm text-muted leading-relaxed max-w-3xl mt-3">
            Live Zcash network statistics: block height, hashrate, difficulty, peer count,
            circulating supply, shielded pool balances, and mining pool distribution —
            indexed directly from a Zebra full node.
          </p>
        </div>
        <div className="mb-6 h-24 bg-cipher-border-alpha/30 rounded-lg animate-pulse" />
        <div className="mb-8 h-[300px] bg-cipher-border-alpha/30 rounded-lg animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="card p-6 min-h-[200px]">
              <div className="h-4 w-32 bg-cipher-border rounded animate-pulse mb-4" />
              <div className="space-y-3">
                {[...Array(4)].map((_, j) => (
                  <div key={j} className="flex justify-between">
                    <div className="h-3 w-24 bg-cipher-border rounded animate-pulse" />
                    <div className="h-3 w-16 bg-cipher-border rounded animate-pulse" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <Card className="text-center">
          <CardBody className="py-16">
            <div className="text-5xl mb-6">&#x26A0;&#xFE0F;</div>
            <h2 className="text-xl font-bold text-primary mb-3">Network Data Unavailable</h2>
            <p className="text-secondary mb-6">{error || 'Failed to load network data'}</p>
            <button
              onClick={fetchData}
              className="px-6 py-2 bg-cipher-cyan text-cipher-bg font-semibold rounded-lg hover:bg-cipher-yellow transition-colors"
            >
              Retry
            </button>
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      {/* Header - cypherpunk style */}
      <div className="mb-8 animate-fade-in">
        <p className="text-xs text-muted font-mono uppercase tracking-widest mb-3">
          <span className="opacity-50">{'>'}</span> NETWORK_STATUS
        </p>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <h1 className="text-2xl sm:text-3xl font-bold text-primary">
            Network Overview
          </h1>
        </div>
      </div>

      <NetworkSectionNav />

      {/* ── OVERVIEW ── */}
      <section id="network-overview" className="scroll-mt-36 mb-16">
        <OverviewHeroStrip
          height={stats.network.height}
          healthy={health?.zebra.healthy ?? null}
          subversion={stats.network.subversion}
          shieldedSupplyPct={
            stats.supply && stats.supply.chainSupply > 0
              ? (stats.supply.totalShielded / stats.supply.chainSupply) * 100
              : null
          }
          tx24h={stats.blockchain.tx24h}
          peers={stats.network.peers}
          hashrate={formatHashrate(stats.mining.networkHashrateRaw)}
        />

        {/* On Crosslink: show the block activity chart (peer map has tiny sample size).
            On mainnet/testnet: show the geographic node map. */}
        <div className="mb-8 animate-fade-in-up" style={{ animationDelay: '100ms' }}>
          <Suspense fallback={
            <div className="card p-8 flex items-center justify-center min-h-[300px]">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-cipher-cyan border-t-transparent" />
            </div>
          }>
            {isCrosslink ? <BlockActivityChart limit={80} /> : <NodeMap />}
          </Suspense>
        </div>

        {stats.supply && (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 mb-6 animate-fade-in-up" style={{ animationDelay: '120ms' }}>
              <Suspense fallback={<div className="card h-48 animate-pulse" />}>
                <SupplyEmissionPanel
                  circulating={emission?.circulating ?? stats.supply.chainSupply}
                  remaining={emission?.remaining ?? Math.max(0, 21_000_000 - stats.supply.chainSupply)}
                  circulatingPct={emission?.circulatingPct ?? (stats.supply.chainSupply / 21_000_000) * 100}
                  dailyEmission={emission?.dailyEmissionEstimate ?? stats.mining.dailyRevenue}
                />
              </Suspense>
              <Suspense fallback={<div className="card h-48 animate-pulse" />}>
                <HalvingPanel halving={halving} />
              </Suspense>
            </div>

            <ChainInfoStrip stats={stats} zecPrice={zecPrice} getUpgradeUrl={getUpgradeUrl} />
          </>
        )}

        <div className="animate-fade-in-up" style={{ animationDelay: '160ms' }}>
          <Suspense fallback={<div className="card h-64 animate-pulse" />}>
            <RecentBlocksTable />
          </Suspense>
        </div>
      </section>

      {stats.supply && (
        <>
          {/* ── SUPPLY ── */}
          <section id="network-supply" className="scroll-mt-36 mb-16 pt-2">
            <SectionHeading title="Supply" subtitle="Pool distribution and chain supply history" />

            <Card className="mb-6 animate-fade-in-up">
              <CardBody>
                <div className="flex items-center gap-2 mb-5">
                  <span className="text-xs text-muted font-mono uppercase tracking-widest opacity-50">{'>'}</span>
                  <h2 className="text-sm font-bold font-mono text-secondary uppercase tracking-wider">SUPPLY_DISTRIBUTION</h2>
                </div>

                <div className="flex justify-between text-sm mb-3">
                  <span className="text-secondary">Shielded</span>
                  <span className="text-primary font-mono font-bold">{stats.supply!.shieldedPercentage.toFixed(1)}%</span>
                </div>

                <div className="h-4 bg-cipher-bg rounded-full overflow-hidden flex mb-4">
                  {(stats.supply!.ironwood || 0) > 0 && (
                    <div className="h-full bg-cipher-yellow" style={{ width: `${(stats.supply!.ironwood / stats.supply!.chainSupply) * 100}%` }} title="Ironwood" />
                  )}
                  <div className="h-full bg-cipher-green" style={{ width: `${(stats.supply!.orchard / stats.supply!.chainSupply) * 100}%` }} title="Orchard" />
                  <div className="h-full bg-cipher-cyan" style={{ width: `${(stats.supply!.sapling / stats.supply!.chainSupply) * 100}%` }} title="Sapling" />
                  <div className="h-full bg-cipher-orange" style={{ width: `${(stats.supply!.sprout / stats.supply!.chainSupply) * 100}%` }} title="Sprout" />
                  <div className="h-full bg-gray-600" style={{ width: `${(stats.supply!.transparent / stats.supply!.chainSupply) * 100}%` }} title="Transparent" />
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                  {(stats.supply!.ironwood || 0) > 0 && (
                    <PoolCard name="Ironwood" amount={stats.supply!.ironwood} color="amber" zecPrice={zecPrice} />
                  )}
                  <PoolCard name="Orchard" amount={stats.supply!.orchard} color="green" zecPrice={zecPrice} />
                  <PoolCard name="Sapling" amount={stats.supply!.sapling} color="cyan" zecPrice={zecPrice} />
                  <PoolCard name="Sprout" amount={stats.supply!.sprout} color="amber" zecPrice={zecPrice} isSmall />
                </div>

                {breakdown && breakdown.categories.length > 0 && (
                  <div className="border-t pt-4 mt-4" style={{ borderColor: 'var(--color-border-subtle)' }}>
                    <div className="flex items-center justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => setBreakdownOpen((o) => !o)}
                        className="flex items-center gap-2 text-xs font-mono text-secondary hover:text-primary transition-colors"
                        aria-expanded={breakdownOpen}
                      >
                        <span className="text-muted opacity-50">{breakdownOpen ? '▼' : '▶'}</span>
                        Transparent breakdown
                        <span className="text-muted">({breakdown.labeledPercentage.toFixed(1)}% labeled)</span>
                      </button>
                      <Link href="/rich-list" className="text-xs font-mono text-muted hover:text-primary transition-colors whitespace-nowrap">
                        Rich List &rarr;
                      </Link>
                    </div>

                    {breakdownOpen && (() => {
                      const labeled = breakdown.categories.filter(c => c.category !== 'unlabeled');
                      const unlabeled = breakdown.categories.find(c => c.category === 'unlabeled');
                      const maxLabeled = Math.max(...labeled.map(c => c.totalBalance), 1);
                      return (
                        <div className="mt-4">
                          <div className="flex items-center gap-3 mb-4">
                            <div className="flex-1 h-2.5 bg-gray-700/50 rounded-full overflow-hidden flex">
                              {labeled.map(c => (
                                <div
                                  key={c.category}
                                  className={`h-full ${breakdownColor(c.category)}`}
                                  style={{ width: `${c.percentage}%` }}
                                />
                              ))}
                            </div>
                          </div>
                          <div className="space-y-2">
                            {labeled.filter(c => c.percentage >= 0.1).map(c => (
                              <div key={c.category} className="flex items-center gap-2">
                                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${breakdownColor(c.category)}`} />
                                <span className="text-[11px] font-mono text-secondary capitalize w-20 truncate">{c.category}</span>
                                <div className="flex-1 h-1.5 bg-gray-700/30 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${breakdownColor(c.category)}`}
                                    style={{ width: `${(c.totalBalance / maxLabeled) * 100}%` }}
                                  />
                                </div>
                                <span className="text-[11px] font-mono text-primary text-right w-24 tabular-nums">
                                  {c.totalBalance >= 1000 ? `${(c.totalBalance / 1000).toFixed(1)}K` : c.totalBalance.toFixed(0)} ZEC
                                </span>
                                <span className="text-[10px] font-mono text-muted text-right w-12 tabular-nums">
                                  {c.percentage.toFixed(1)}%
                                </span>
                              </div>
                            ))}
                            {unlabeled && (
                              <div className="flex items-center gap-2 pt-1 border-t border-cipher-border-alpha/50">
                                <span className="w-2 h-2 rounded-full flex-shrink-0 bg-gray-600" />
                                <span className="text-[11px] font-mono text-muted w-20">Unlabeled</span>
                                <div className="flex-1" />
                                <span className="text-[11px] font-mono text-muted text-right w-24 tabular-nums">
                                  {unlabeled.totalBalance >= 1000 ? `${(unlabeled.totalBalance / 1000).toFixed(1)}K` : unlabeled.totalBalance.toFixed(0)} ZEC
                                </span>
                                <span className="text-[10px] font-mono text-muted text-right w-12 tabular-nums">
                                  {unlabeled.percentage.toFixed(1)}%
                                </span>
                              </div>
                            )}
                          </div>

                          {breakdown.addressTypes && breakdown.addressTypes.length > 0 && (
                            <div className="mt-5 pt-4 border-t border-cipher-border-alpha/50">
                              <p className="text-[11px] font-mono text-muted uppercase tracking-wider mb-3">Script Types</p>
                              <div className="flex items-center gap-3 mb-3">
                                <div className="flex-1 h-2.5 bg-gray-700/50 rounded-full overflow-hidden flex">
                                  {breakdown.addressTypes.map(t => (
                                    <div
                                      key={t.type}
                                      className={`h-full ${t.type === 'P2PKH' ? 'bg-blue-500' : t.type === 'P2SH' ? 'bg-amber-500' : 'bg-gray-500'}`}
                                      style={{ width: `${t.percentage}%` }}
                                    />
                                  ))}
                                </div>
                              </div>
                              <div className="space-y-2">
                                {breakdown.addressTypes.map(t => (
                                  <div key={t.type} className="flex items-center gap-2">
                                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${t.type === 'P2PKH' ? 'bg-blue-500' : t.type === 'P2SH' ? 'bg-amber-500' : 'bg-gray-500'}`} />
                                    <span className="text-[11px] font-mono text-secondary w-12">{t.type}</span>
                                    <span className="text-[10px] font-mono text-muted flex-1 truncate">{t.description}</span>
                                    <span className="text-[11px] font-mono text-primary text-right w-20 tabular-nums">
                                      {t.addressCount.toLocaleString()}
                                    </span>
                                    <span className="text-[10px] font-mono text-muted text-right w-12 tabular-nums">
                                      {t.percentage.toFixed(1)}%
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </CardBody>
            </Card>

            <div className="space-y-6 animate-fade-in-up">
              <Suspense fallback={<div className="card h-80 animate-pulse" />}>
                <PoolDistributionChart />
              </Suspense>
              <Suspense fallback={<div className="card h-64 animate-pulse" />}>
                <NetworkHistoryCharts />
              </Suspense>
              <Suspense fallback={<div className="card h-80 animate-pulse" />}>
                <FeeDistributionChart />
              </Suspense>
              <Suspense fallback={<div className="card h-80 animate-pulse" />}>
                <ProtocolStatsChart />
              </Suspense>
            </div>

            {/* Mining summary teaser */}
            <div className="mt-8 animate-fade-in-up">
              <Card>
                <CardBody className="py-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold font-mono text-secondary uppercase tracking-wider mb-1">Mining</h3>
                      <div className="flex items-center gap-4 text-[11px] font-mono text-muted">
                        <span>Hashrate: <span className="text-primary">{formatHashrate(stats.mining.networkHashrateRaw)}</span></span>
                        <span>Difficulty: <span className="text-primary">{(stats.mining.difficulty / 1e6).toFixed(1)}M</span></span>
                        <span>Block time: <span className="text-primary">~{stats.mining.avgBlockTime}s</span></span>
                      </div>
                    </div>
                    <Link
                      href="/mining"
                      className="flex items-center gap-1.5 text-xs font-mono text-cipher-cyan hover:text-cipher-cyan-bright transition-colors"
                    >
                      <span>Pool distribution & miner behavior</span>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </Link>
                  </div>
                </CardBody>
              </Card>
            </div>
          </section>

        </>
      )}
    </div>
  );
}

function breakdownColor(category: string): string {
  const c = category.toLowerCase();
  if (c === 'exchange') return 'bg-cipher-cyan';
  if (c === 'mining' || c === 'mining_pool') return 'bg-cipher-yellow';
  if (c === 'defi' || c === 'bridge') return 'bg-cipher-green';
  if (c === 'custodian' || c === 'fund') return 'bg-cipher-purple';
  return 'bg-gray-500';
}

// ==========================================================================
// SUB-COMPONENTS
// ==========================================================================

function SectionHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div
      className="mb-8 pt-6 border-t"
      style={{ borderColor: 'var(--color-border-subtle)' }}
    >
      <h2 className="text-lg sm:text-xl font-bold font-mono text-primary uppercase tracking-wider">{title}</h2>
      {subtitle && <p className="text-xs text-muted font-mono mt-1.5 normal-case tracking-normal">{subtitle}</p>}
    </div>
  );
}

function HoverTip({ tip, children, className = '' }: { tip?: string; children: ReactNode; className?: string }) {
  if (!tip) return <>{children}</>;
  return (
    <div className={`group relative ${className}`} title={tip}>
      {children}
      <div
        role="tooltip"
        className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-[calc(100%+8px)] z-20 w-52 px-2.5 py-2 text-[10px] leading-snug text-secondary rounded-md border opacity-0 group-hover:opacity-100 transition-opacity duration-150 hidden sm:block"
        style={{ backgroundColor: 'var(--color-surface-solid)', borderColor: 'var(--color-border-subtle)' }}
      >
        {tip}
      </div>
    </div>
  );
}

function formatNodeVersion(subversion: string | null | undefined): string {
  if (!subversion) return '—';
  return subversion.replace(/^\/Zebra:?/i, '').replace(/\/$/, '').trim() || subversion;
}

function OverviewHeroStrip({
  height,
  healthy,
  subversion,
  shieldedSupplyPct,
  tx24h,
  peers,
  hashrate,
}: {
  height: number;
  healthy: boolean | null;
  subversion: string;
  shieldedSupplyPct: number | null;
  tx24h: number;
  peers: number;
  hashrate: string;
}) {
  const isHealthy = healthy !== false;
  const version = formatNodeVersion(subversion);

  const secondary = [
    { label: 'TX (24h)', value: tx24h.toLocaleString(), tip: 'Transactions processed in the last 24 hours.' },
    { label: 'Peers', value: peers.toString(), tip: 'Nodes connected to this explorer.' },
    { label: 'Hashrate', value: hashrate, tip: 'Combined mining power securing the network.' },
  ];

  return (
    <Card className="mb-6 animate-fade-in-up">
      <CardBody className="py-4 sm:py-5">
        <div className="grid grid-cols-2 gap-4 sm:gap-8 mb-4">
          <div>
            <p className="text-[10px] text-muted font-mono uppercase tracking-wider mb-1">Block height</p>
            <p className="text-2xl sm:text-3xl font-bold font-mono text-primary tabular-nums">
              {height.toLocaleString()}
            </p>
          </div>

          <div className="text-right">
            <p className="text-[10px] text-muted font-mono uppercase tracking-wider mb-1">Shielded supply</p>
            {shieldedSupplyPct != null ? (
              <>
                <p className="text-2xl sm:text-3xl font-bold font-mono text-cipher-yellow tabular-nums">
                  {shieldedSupplyPct.toFixed(1)}%
                </p>
                <p className="text-[10px] text-muted font-mono mt-0.5">of chain supply</p>
              </>
            ) : (
              <p className="text-2xl font-bold font-mono text-muted">—</p>
            )}
          </div>
        </div>

        <div
          className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-4 border-t text-xs font-mono"
          style={{ borderColor: 'var(--color-border-subtle)' }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="relative flex h-2 w-2 flex-shrink-0">
              {isHealthy && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cipher-green opacity-75" />
              )}
              <span className={`relative inline-flex rounded-full h-2 w-2 ${isHealthy ? 'bg-cipher-green' : 'bg-cipher-orange'}`} />
            </span>
            <span className="text-secondary truncate">
              {healthy == null ? 'Checking node…' : isHealthy ? 'Synced' : 'Degraded'}
            </span>
            <span className="text-muted/40" aria-hidden>·</span>
            <span className="text-muted truncate">Zebra {version}</span>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {secondary.map((item, i) => (
              <span key={item.label} className="inline-flex items-center gap-4">
                {i > 0 && <span className="hidden sm:inline text-muted/30" aria-hidden>·</span>}
                <HoverTip tip={item.tip} className="cursor-help">
                  <span className="text-muted">{item.label}</span>
                  <span className="text-primary font-semibold ml-1">{item.value}</span>
                </HoverTip>
              </span>
            ))}
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

function ChainInfoStrip({
  stats,
  zecPrice,
  getUpgradeUrl,
}: {
  stats: NetworkStats;
  zecPrice: number | null;
  getUpgradeUrl: (name: string | null) => string | undefined;
}) {
  const supply = stats.supply!;
  const upgradeUrl = getUpgradeUrl(supply.activeUpgrade);
  const latestBlockAgo = `${Math.floor((Date.now() / 1000 - stats.blockchain.latestBlockTime) / 60)}m ago`;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8 animate-fade-in-up" style={{ animationDelay: '140ms' }}>
      <ChainInfoChip
        label="Lockbox"
        value={`${supply.lockbox.toLocaleString(undefined, { maximumFractionDigits: 0 })} ZEC`}
        subtitle={zecPrice ? `$${((supply.lockbox * zecPrice) / 1e6).toFixed(1)}M` : undefined}
        tooltip="ZEC reserved in the protocol lockbox for future Zcash development funding."
      />
      <ChainInfoChip
        label="Blockchain size"
        value={`${stats.blockchain.sizeGB.toFixed(2)} GB`}
        tooltip="Total disk space used by the full Zcash blockchain on this node."
      />
      <ChainInfoChip
        label="Latest block"
        value={latestBlockAgo}
        subtitle={new Date(stats.blockchain.latestBlockTime * 1000).toLocaleTimeString()}
        tooltip="Time since the most recent block was mined. Zcash targets a new block every 75 seconds."
      />
      <HoverTip tip="The currently active Zcash network upgrade.">
        <div className="card p-3 h-full cursor-help">
          <div className="text-[10px] text-muted font-mono uppercase tracking-wider mb-1">Network upgrade</div>
          {upgradeUrl ? (
            <a href={upgradeUrl} target="_blank" rel="noopener noreferrer" className="inline-block hover:opacity-80 transition-opacity">
              <Badge color="green">{supply.activeUpgrade || 'Unknown'}</Badge>
            </a>
          ) : (
            <Badge color="green">{supply.activeUpgrade || 'Unknown'}</Badge>
          )}
        </div>
      </HoverTip>
    </div>
  );
}

function ChainInfoChip({ label, value, subtitle, tooltip }: {
  label: string; value: string; subtitle?: string; tooltip?: string;
}) {
  return (
    <HoverTip tip={tooltip}>
      <Card variant="compact" className="h-full cursor-help">
        <CardBody>
          <div className="text-[10px] text-muted font-mono uppercase tracking-wider mb-1">{label}</div>
          <div className="text-sm font-bold font-mono text-primary">{value}</div>
          {subtitle && <p className="text-[10px] mt-0.5 text-muted font-mono">{subtitle}</p>}
        </CardBody>
      </Card>
    </HoverTip>
  );
}

/** Small stat card for mining extras */
function StatCard({ label, value, subtitle, tooltip }: {
  label: string; value: string; subtitle?: string; tooltip?: string;
}) {
  return (
    <HoverTip tip={tooltip}>
      <Card variant="compact" className="h-full cursor-help">
        <CardBody>
          <div className="text-[10px] text-muted font-mono uppercase tracking-wider mb-2">{label}</div>
          <div className="text-sm sm:text-lg font-bold font-mono text-primary whitespace-nowrap truncate">{value}</div>
          {subtitle && <p className="text-[10px] mt-1 text-muted">{subtitle}</p>}
        </CardBody>
      </Card>
    </HoverTip>
  );
}
function PoolCard({ name, amount, color, zecPrice, isSmall }: {
  name: string; amount: number; color: string; zecPrice: number | null; isSmall?: boolean;
}) {
  const colorMap: Record<string, string> = {
    green: 'text-cipher-green',
    cyan: 'text-cipher-cyan',
    amber: 'text-cipher-yellow',
  };
  const dotColor: Record<string, string> = {
    green: 'bg-cipher-green',
    cyan: 'bg-cipher-cyan',
    amber: 'bg-cipher-yellow',
  };

  const display = isSmall ? `${(amount / 1000).toFixed(1)}K` : `${(amount / 1e6).toFixed(2)}M`;

  return (
    <div className="bg-cipher-bg/50 rounded-lg p-3 text-center">
      <div className={`${colorMap[color]} text-base sm:text-lg font-bold font-mono`}>{display}</div>
      {zecPrice && (
        <div className="text-[10px] text-muted font-mono">
          ${isSmall
            ? ((amount / 1000) * zecPrice).toFixed(0) + 'K'
            : ((amount / 1e6) * zecPrice).toFixed(1) + 'M'}
        </div>
      )}
      <div className="flex items-center justify-center gap-1.5 text-[10px] sm:text-xs text-secondary mt-1">
        <span className={`w-1.5 h-1.5 rounded-full ${dotColor[color]}`}></span>
        {name === 'Ironwood' ? (
          <Link href="/ironwood" className="hover:text-cipher-yellow hover:underline">
            {name}
          </Link>
        ) : name}
      </div>
    </div>
  );
}
