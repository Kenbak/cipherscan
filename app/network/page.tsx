'use client';

import { useEffect, useState, lazy, Suspense } from 'react';
import { useWebSocket } from '@/hooks/useWebSocket';
import { getApiUrl, API_CONFIG } from '@/lib/api-config';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Tooltip } from '@/components/Tooltip';

const NodeMap = lazy(() => import('@/components/NodeMap'));

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

// Format hashrate with appropriate unit
function formatHashrate(hashrate: number): string {
  if (hashrate >= 1e12) return `${(hashrate / 1e12).toFixed(2)} TH/s`;
  if (hashrate >= 1e9) return `${(hashrate / 1e9).toFixed(2)} GH/s`;
  if (hashrate >= 1e6) return `${(hashrate / 1e6).toFixed(2)} MH/s`;
  if (hashrate >= 1e3) return `${(hashrate / 1e3).toFixed(2)} KH/s`;
  return `${hashrate.toFixed(2)} H/s`;
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
    dailyRevenue: number;
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

export default function NetworkPage() {
  const [stats, setStats] = useState<NetworkStats | null>(null);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previousStats, setPreviousStats] = useState<NetworkStats | null>(null);
  const [zecPrice, setZecPrice] = useState<number | null>(null);

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
      const [statsRes, healthRes, priceRes] = await Promise.all([
        fetch(`${apiUrl}/api/network/stats`),
        fetch(`${apiUrl}/api/network/health`),
        fetch(`${API_CONFIG.POSTGRES_API_URL}/api/price`).catch(() => null),
      ]);

      if (!statsRes.ok || !healthRes.ok) throw new Error('Failed to fetch network data');

      const statsData = await statsRes.json();
      const healthData = await healthRes.json();

      if (priceRes?.ok) {
        const priceData = await priceRes.json();
        setZecPrice(priceData.price);
      }

      setPreviousStats(stats);
      setStats(statsData);
      setHealth(healthData);
      setError(null);
    } catch (err: any) {
      console.error('Error fetching network data:', err);
      setError(err.message || 'Failed to load network data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div className="mb-8">
          <div className="h-3 w-32 bg-cipher-border rounded animate-pulse mb-3" />
          <div className="h-8 w-48 bg-cipher-border rounded animate-pulse" />
        </div>
        <div className="mb-8 h-[300px] bg-cipher-border/30 rounded-lg animate-pulse" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="card p-4">
              <div className="h-2 w-16 bg-cipher-border rounded animate-pulse mb-3" />
              <div className="h-6 w-24 bg-cipher-border rounded animate-pulse" />
            </div>
          ))}
        </div>
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
              className="px-6 py-2 bg-cipher-cyan text-cipher-bg font-semibold rounded-lg hover:bg-cipher-green transition-colors"
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
        <div className="flex items-center justify-between">
          <h1 className="text-2xl sm:text-3xl font-bold text-primary">
            Network Overview
          </h1>
          {/* Node status badge */}
          {health && (
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                  health.zebra.healthy ? 'bg-cipher-green' : 'bg-amber-400'
                }`}></span>
                <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                  health.zebra.healthy ? 'bg-cipher-green' : 'bg-amber-400'
                }`}></span>
              </span>
              <span className="text-xs text-muted font-mono">
                Zebra {stats.network.subversion}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Key Metrics - compact inline row */}
      <div className="grid grid-cols-3 gap-3 sm:gap-4 mb-8 animate-fade-in-up" style={{ animationDelay: '50ms' }}>
        <MetricCard
          label="Block Height"
          value={stats.network.height.toLocaleString()}
          tooltip="The latest block number confirmed on the Zcash blockchain."
        />
        <MetricCard
          label="Transactions (24h)"
          value={stats.blockchain.tx24h.toLocaleString()}
          tooltip="Total number of transactions processed in the last 24 hours."
        />
        <MetricCard
          label="Connected Peers"
          value={stats.network.peers.toString()}
          tooltip="Number of Zcash nodes currently connected to this explorer's node."
        />
      </div>

      {/* Node Map - lazy loaded, doesn't block initial render */}
      <div className="mb-8 animate-fade-in-up" style={{ animationDelay: '100ms' }}>
        <Suspense fallback={
          <div className="card p-8 flex items-center justify-center min-h-[300px]">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-cipher-cyan border-t-transparent" />
          </div>
        }>
          <NodeMap />
        </Suspense>
      </div>

      {/* Supply Distribution + Chain Stats */}
      {stats.supply && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 mb-8">
          {/* Supply Distribution */}
          <div className="animate-fade-in-up" style={{ animationDelay: '150ms' }}>
            <Card>
              <CardBody>
                <div className="flex items-center gap-2 mb-5">
                  <span className="text-xs text-muted font-mono uppercase tracking-widest opacity-50">{'>'}</span>
                  <h2 className="text-sm font-bold font-mono text-purple-400 uppercase tracking-wider">SUPPLY_DISTRIBUTION</h2>
                </div>

                {/* Shielded vs Transparent */}
                <div className="flex justify-between text-sm mb-3">
                  <span className="text-secondary">Shielded</span>
                  <span className="text-primary font-mono font-bold">{stats.supply!.shieldedPercentage.toFixed(1)}%</span>
                </div>

                {/* Multi-pool bar */}
                <div className="h-4 bg-cipher-bg rounded-full overflow-hidden flex mb-4">
                  <div className="h-full bg-green-500" style={{ width: `${(stats.supply!.orchard / stats.supply!.chainSupply) * 100}%` }} title="Orchard" />
                  <div className="h-full bg-cyan-500" style={{ width: `${(stats.supply!.sapling / stats.supply!.chainSupply) * 100}%` }} title="Sapling" />
                  <div className="h-full bg-amber-500" style={{ width: `${(stats.supply!.sprout / stats.supply!.chainSupply) * 100}%` }} title="Sprout" />
                  <div className="h-full bg-gray-600" style={{ width: `${(stats.supply!.transparent / stats.supply!.chainSupply) * 100}%` }} title="Transparent" />
                </div>

                {/* Pool cards */}
                <div className="grid grid-cols-3 gap-2">
                  <PoolCard
                    name="Orchard"
                    amount={stats.supply!.orchard}
                    color="green"
                    zecPrice={zecPrice}
                  />
                  <PoolCard
                    name="Sapling"
                    amount={stats.supply!.sapling}
                    color="cyan"
                    zecPrice={zecPrice}
                  />
                  <PoolCard
                    name="Sprout"
                    amount={stats.supply!.sprout}
                    color="amber"
                    zecPrice={zecPrice}
                    isSmall
                  />
                </div>
              </CardBody>
            </Card>
          </div>

          {/* Chain Stats */}
          <div className="animate-fade-in-up" style={{ animationDelay: '200ms' }}>
            <Card>
              <CardBody>
                <div className="flex items-center gap-2 mb-5">
                  <span className="text-xs text-muted font-mono uppercase tracking-widest opacity-50">{'>'}</span>
                  <h2 className="text-sm font-bold font-mono text-cipher-cyan uppercase tracking-wider">CHAIN_INFO</h2>
                </div>

                <div className="space-y-0">
                  <InfoRow
                    label="Total Supply"
                    value={`${(stats.supply!.chainSupply / 1e6).toFixed(2)}M ZEC`}
                    tooltip="Total ZEC mined so far. Zcash has a fixed cap of 21 million ZEC."
                  />
                  <InfoRow
                    label="Lockbox"
                    value={`${stats.supply!.lockbox.toLocaleString(undefined, { maximumFractionDigits: 0 })} ZEC`}
                    subtitle={zecPrice ? `$${((stats.supply!.lockbox * zecPrice) / 1e6).toFixed(1)}M` : undefined}
                    tooltip="ZEC reserved in the protocol lockbox for future Zcash development funding."
                  />
                  <InfoRow
                    label="Network Upgrade"
                    value={stats.supply!.activeUpgrade || 'Unknown'}
                    badge
                    href={getUpgradeUrl(stats.supply!.activeUpgrade)}
                    tooltip="The currently active Zcash network upgrade. Click the badge to learn more."
                  />
                  <InfoRow
                    label="Blockchain Size"
                    value={`${stats.blockchain.sizeGB.toFixed(2)} GB`}
                    tooltip="Total disk space used by the full Zcash blockchain on this node."
                  />
                  <InfoRow
                    label="Latest Block"
                    value={`${Math.floor((Date.now() / 1000 - stats.blockchain.latestBlockTime) / 60)}m ago`}
                    subtitle={new Date(stats.blockchain.latestBlockTime * 1000).toLocaleTimeString()}
                    tooltip="Time since the most recent block was mined. Zcash targets a new block every 75 seconds."
                  />
                </div>
              </CardBody>
            </Card>
          </div>
        </div>
      )}

      {/* Mining & Performance */}
      <div className="animate-fade-in-up" style={{ animationDelay: '250ms' }}>
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xs text-muted font-mono uppercase tracking-widest opacity-50">{'>'}</span>
          <h2 className="text-sm font-bold font-mono text-cipher-cyan uppercase tracking-wider">MINING_PERFORMANCE</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          <StatCard label="Hashrate" value={formatHashrate(stats.mining.networkHashrateRaw)} tooltip="Combined computing power securing the Zcash network." />
          <StatCard label="Difficulty" value={stats.mining.difficulty.toFixed(1)} tooltip="How hard it is to mine a new block. Adjusts automatically to maintain ~75s block times." />
          <StatCard
            label="Block Time"
            value={`${stats.mining.avgBlockTime}s`}
            subtitle="Target: 75s"
            status={stats.mining.avgBlockTime <= 90 ? 'good' : stats.mining.avgBlockTime <= 120 ? 'warning' : 'bad'}
            tooltip="Average time between blocks over the last 24 hours. Green means close to the 75s target."
          />
          <StatCard label="Blocks (24h)" value={stats.mining.blocks24h.toLocaleString()} tooltip="Number of blocks mined in the last 24 hours." />
          <StatCard label="Block Reward" value={`${stats.mining.blockReward} ZEC`} tooltip="ZEC paid to miners for each new block." />
          <StatCard
            label="TX/Block"
            value={(stats.blockchain.tx24h / stats.mining.blocks24h).toFixed(1)}
            subtitle="24h avg"
            tooltip="Average number of transactions included per block over the last 24 hours."
          />
          <StatCard
            label="Daily Revenue"
            value={`${(stats.mining.dailyRevenue / 1000).toFixed(1)}K ZEC`}
            subtitle={zecPrice ? `$${((stats.mining.dailyRevenue * zecPrice) / 1000).toFixed(1)}K` : undefined}
            tooltip="Total ZEC paid to miners in the last 24 hours (blocks × block reward)."
          />
        </div>
      </div>
    </div>
  );
}

// ==========================================================================
// SUB-COMPONENTS
// ==========================================================================

/** Compact top metric card */
function MetricCard({ label, value, tooltip }: { label: string; value: string; tooltip?: string }) {
  return (
    <Card variant="compact">
      <CardBody>
        <div className="text-[10px] sm:text-xs text-muted font-mono uppercase tracking-wider mb-1 flex items-center gap-1">
          {label}
          {tooltip && <Tooltip content={tooltip} />}
        </div>
        <div className="text-xl sm:text-2xl lg:text-3xl font-bold font-mono text-primary">{value}</div>
      </CardBody>
    </Card>
  );
}

/** Pool breakdown card */
function PoolCard({ name, amount, color, zecPrice, isSmall }: {
  name: string; amount: number; color: string; zecPrice: number | null; isSmall?: boolean;
}) {
  const colorMap: Record<string, string> = {
    green: 'text-green-400',
    cyan: 'text-cyan-400',
    amber: 'text-amber-400',
  };
  const dotColor: Record<string, string> = {
    green: 'bg-green-400',
    cyan: 'bg-cyan-400',
    amber: 'bg-amber-400',
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
        {name}
      </div>
    </div>
  );
}

/** Info row for chain stats */
function InfoRow({ label, value, subtitle, badge, href, tooltip }: {
  label: string; value: string; subtitle?: string; badge?: boolean; href?: string; tooltip?: string;
}) {
  const content = badge ? (
    <Badge color="green">{value}</Badge>
  ) : (
    <span className="font-mono font-bold text-sm text-primary">{value}</span>
  );

  return (
    <div className="flex justify-between items-center py-3 border-b border-cipher-border last:border-b-0">
      <span className="text-sm text-secondary flex items-center gap-1.5">
        {label}
        {tooltip && <Tooltip content={tooltip} />}
      </span>
      <div className="text-right">
        {href ? (
          <a href={href} target="_blank" rel="noopener noreferrer" className="hover:opacity-80 transition-opacity">
            {content}
          </a>
        ) : content}
        {subtitle && (
          <div className="text-[10px] text-muted font-mono mt-0.5">{subtitle}</div>
        )}
      </div>
    </div>
  );
}

/** Small stat card for mining section */
function StatCard({ label, value, subtitle, status, tooltip }: {
  label: string; value: string; subtitle?: string; status?: 'good' | 'warning' | 'bad'; tooltip?: string;
}) {
  const statusColors: Record<string, string> = {
    good: 'text-cipher-green',
    warning: 'text-amber-400',
    bad: 'text-red-400',
  };
  const valueColor = status ? statusColors[status] : 'text-primary';

  return (
    <Card variant="compact">
      <CardBody>
        <div className="text-[10px] text-muted font-mono uppercase tracking-wider mb-2 flex items-center gap-1">
          {label}
          {tooltip && <Tooltip content={tooltip} />}
        </div>
        <div className={`text-lg sm:text-xl font-bold font-mono ${valueColor}`}>{value}</div>
        {subtitle && <p className="text-[10px] mt-1 text-muted">{subtitle}</p>}
      </CardBody>
    </Card>
  );
}
