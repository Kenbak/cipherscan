'use client';

import { useEffect, useState } from 'react';
import { useWebSocket } from '@/hooks/useWebSocket';
import { getApiUrl } from '@/lib/api-config';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import NodeMap from '@/components/NodeMap';

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

  // Fetch ZEC price
  useEffect(() => {
    const fetchPrice = async () => {
      try {
        const response = await fetch(
          'https://api.coingecko.com/api/v3/simple/price?ids=zcash&vs_currencies=usd'
        );
        if (response.ok) {
          const data = await response.json();
          setZecPrice(data.zcash.usd);
        }
      } catch (error) {
        console.error('Error fetching ZEC price:', error);
      }
    };
    fetchPrice();
  }, []);

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
      const [statsRes, healthRes] = await Promise.all([
        fetch(`${apiUrl}/api/network/stats`),
        fetch(`${apiUrl}/api/network/health`),
      ]);

      if (!statsRes.ok || !healthRes.ok) throw new Error('Failed to fetch network data');

      const statsData = await statsRes.json();
      const healthData = await healthRes.json();

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
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-cipher-cyan border-t-transparent" />
          <p className="text-secondary ml-4 font-mono">Loading network stats...</p>
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
          accent="cyan"
        />
        <MetricCard
          label="Transactions (24h)"
          value={stats.blockchain.tx24h.toLocaleString()}
          accent="cyan"
        />
        <MetricCard
          label="Connected Peers"
          value={stats.network.peers.toString()}
          accent="green"
        />
      </div>

      {/* Node Map - hero visual */}
      <div className="mb-8 animate-fade-in-up" style={{ animationDelay: '100ms' }}>
        <NodeMap />
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
                  <InfoRow label="Total Supply" value={`${(stats.supply!.chainSupply / 1e6).toFixed(2)}M ZEC`} />
                  <InfoRow
                    label="Lockbox"
                    value={`${stats.supply!.lockbox.toLocaleString(undefined, { maximumFractionDigits: 0 })} ZEC`}
                    subtitle={zecPrice ? `$${((stats.supply!.lockbox * zecPrice) / 1e6).toFixed(1)}M` : undefined}
                  />
                  <InfoRow label="Network Upgrade" value={stats.supply!.activeUpgrade || 'Unknown'} badge />
                  <InfoRow label="Blockchain Size" value={`${stats.blockchain.sizeGB.toFixed(2)} GB`} />
                  <InfoRow
                    label="Latest Block"
                    value={`${Math.floor((Date.now() / 1000 - stats.blockchain.latestBlockTime) / 60)}m ago`}
                    subtitle={new Date(stats.blockchain.latestBlockTime * 1000).toLocaleTimeString()}
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
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard label="Hashrate" value={formatHashrate(stats.mining.networkHashrateRaw)} />
          <StatCard label="Difficulty" value={stats.mining.difficulty.toFixed(1)} />
          <StatCard
            label="Block Time"
            value={`${stats.mining.avgBlockTime}s`}
            subtitle="Target: 75s"
            status={stats.mining.avgBlockTime <= 90 ? 'good' : stats.mining.avgBlockTime <= 120 ? 'warning' : 'bad'}
          />
          <StatCard label="Blocks (24h)" value={stats.mining.blocks24h.toLocaleString()} />
          <StatCard label="Block Reward" value={`${stats.mining.blockReward} ZEC`} />
          <StatCard
            label="Daily Revenue"
            value={`${(stats.mining.dailyRevenue / 1000).toFixed(1)}K ZEC`}
            subtitle={zecPrice ? `$${((stats.mining.dailyRevenue * zecPrice) / 1000).toFixed(1)}K` : undefined}
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
function MetricCard({ label, value, accent }: { label: string; value: string; accent: 'cyan' | 'green' }) {
  const accentColor = accent === 'cyan' ? 'text-cipher-cyan' : 'text-cipher-green';

  return (
    <Card variant="compact">
      <CardBody>
        <div className="text-[10px] sm:text-xs text-muted font-mono uppercase tracking-wider mb-1">{label}</div>
        <div className={`text-xl sm:text-2xl lg:text-3xl font-bold font-mono ${accentColor}`}>{value}</div>
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
function InfoRow({ label, value, subtitle, badge }: {
  label: string; value: string; subtitle?: string; badge?: boolean;
}) {
  return (
    <div className="flex justify-between items-center py-3 border-b border-cipher-border/30 last:border-b-0">
      <span className="text-sm text-secondary">{label}</span>
      <div className="text-right">
        {badge ? (
          <Badge color="green">{value}</Badge>
        ) : (
          <span className="font-mono font-bold text-sm text-primary">{value}</span>
        )}
        {subtitle && (
          <div className="text-[10px] text-muted font-mono mt-0.5">{subtitle}</div>
        )}
      </div>
    </div>
  );
}

/** Small stat card for mining section */
function StatCard({ label, value, subtitle, status }: {
  label: string; value: string; subtitle?: string; status?: 'good' | 'warning' | 'bad';
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
        <div className="text-[10px] text-muted font-mono uppercase tracking-wider mb-2">{label}</div>
        <div className={`text-lg sm:text-xl font-bold font-mono ${valueColor}`}>{value}</div>
        {subtitle && <p className="text-[10px] mt-1 text-muted">{subtitle}</p>}
      </CardBody>
    </Card>
  );
}
