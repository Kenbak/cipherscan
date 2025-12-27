'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useWebSocket } from '@/hooks/useWebSocket';
import { getApiUrl } from '@/lib/api-config';

// Format hashrate with appropriate unit (H/s, KH/s, MH/s, GH/s, TH/s)
function formatHashrate(hashrate: number): string {
  if (hashrate >= 1e12) return `${(hashrate / 1e12).toFixed(2)} TH/s`;
  if (hashrate >= 1e9) return `${(hashrate / 1e9).toFixed(2)} GH/s`;
  if (hashrate >= 1e6) return `${(hashrate / 1e6).toFixed(2)} MH/s`;
  if (hashrate >= 1e3) return `${(hashrate / 1e3).toFixed(2)} KH/s`;
  return `${hashrate.toFixed(2)} H/s`;
}

// Icons
const Icons = {
  Mining: () => (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  ),
  Network: () => (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
    </svg>
  ),
  Database: () => (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
    </svg>
  ),
  Clock: () => (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  Cube: () => (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
    </svg>
  ),
  Check: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  ),
  Users: () => (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  ),
  Activity: () => (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
    </svg>
  ),
  Zap: () => (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  ),
  TrendUp: () => (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
    </svg>
  ),
  Shield: () => (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  ),
};

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

  // Fetch ZEC price from CoinGecko
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

  // WebSocket connection for real-time updates
  const { isConnected, lastMessage } = useWebSocket({
    onMessage: (data) => {
      if (data.type === 'network_stats') {
        setPreviousStats(stats); // Save previous for comparison
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

      if (!statsRes.ok || !healthRes.ok) {
        throw new Error('Failed to fetch network data');
      }

      const statsData = await statsRes.json();
      const healthData = await healthRes.json();

      setPreviousStats(stats); // Save previous for comparison
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
    // Initial fetch
    fetchData();

    // Fallback polling (in case WebSocket fails)
    const interval = setInterval(fetchData, 60000); // Every 60s (less frequent since we have WS)
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-cipher-cyan mb-4"></div>
            <p className="text-secondary font-mono">Loading network stats...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="card">
          <div className="text-center py-12">
            <p className="text-red-600 dark:text-red-400 mb-4">❌ {error || 'Failed to load network data'}</p>
            <button
              onClick={fetchData}
              className="btn-primary"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-12 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8 sm:mb-12 text-center">
          <div className="flex items-center justify-center gap-3 mb-4 text-primary">
            <Icons.Network />
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold font-mono">
              Network Statistics
            </h1>
          </div>
          <p className="text-secondary text-base sm:text-lg max-w-3xl mx-auto px-2">
            Real-time Zcash testnet metrics. Mining stats, network health, and blockchain data.
          </p>
          <div className="flex items-center justify-center gap-2 mt-3">

          </div>
        </div>

        {/* Health Status Banner */}
        {health && (
          <div className={`card mb-6 sm:mb-8 border-2 ${
            health.zebra.healthy && health.zebra.ready
              ? 'gradient-card-health-good'
              : 'gradient-card-health-warning'
          }`}>
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                health.zebra.healthy && health.zebra.ready
                  ? 'bg-cipher-green/10 text-cipher-green'
                  : 'bg-cipher-orange/10 text-cipher-orange'
              }`}>
                <Icons.Check />
              </div>
              <div className="flex-1">
                <p className="text-sm sm:text-base font-semibold text-primary">
                  Node Status: <span className={health.zebra.healthy ? 'text-cipher-green' : 'text-red-400'}>
                    {health.zebra.healthy ? 'Healthy' : 'Unhealthy'}
                  </span>
                  {' • '}
                  Sync: <span className={health.zebra.ready ? 'text-cipher-green' : 'text-cipher-orange'}>
                    {health.zebra.ready ? 'Ready' : 'Syncing'}
                  </span>
                </p>
                <p className="text-xs text-muted font-mono">
                  Zebra {stats.network.subversion} • Protocol {stats.network.protocolVersion}
                </p>
              </div>
              {stats.cached && (
                <span className="text-xs text-muted font-mono">
                  Cached {stats.cacheAge}s ago
                </span>
              )}
            </div>
          </div>
        )}

      {/* Supply Distribution */}
      {stats.supply && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Supply Overview */}
          <div className="card">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-400">
                <Icons.Shield />
              </div>
              <h2 className="text-lg font-bold text-primary">Supply Distribution</h2>
            </div>

            <div className="space-y-4">
              {/* Shielded vs Transparent Summary */}
              <div className="flex justify-between text-sm">
                <span className="text-secondary font-medium">
                  🛡️ Shielded <span className="text-[10px] text-muted">(Orchard + Sapling + Sprout)</span>
                </span>
                <span className="text-primary font-bold">{stats.supply.shieldedPercentage.toFixed(1)}%</span>
              </div>

              {/* Multi-pool Progress Bar */}
              <div>
                <div className="h-5 progress-bar-bg rounded-full overflow-hidden flex">
                  {/* Orchard */}
                  <div
                    className="h-full bg-green-500 relative group"
                    style={{ width: `${(stats.supply.orchard / stats.supply.chainSupply) * 100}%` }}
                    title={`Orchard: ${(stats.supply.orchard / 1000000).toFixed(2)}M ZEC`}
                  />
                  {/* Sapling */}
                  <div
                    className="h-full bg-cyan-500 relative group"
                    style={{ width: `${(stats.supply.sapling / stats.supply.chainSupply) * 100}%` }}
                    title={`Sapling: ${(stats.supply.sapling / 1000000).toFixed(2)}M ZEC`}
                  />
                  {/* Sprout */}
                  <div
                    className="h-full bg-amber-500 relative group"
                    style={{ width: `${(stats.supply.sprout / stats.supply.chainSupply) * 100}%` }}
                    title={`Sprout: ${(stats.supply.sprout / 1000).toFixed(1)}K ZEC`}
                  />
                  {/* Transparent */}
                  <div
                    className="h-full bg-gray-500"
                    style={{ width: `${(stats.supply.transparent / stats.supply.chainSupply) * 100}%` }}
                    title={`Transparent: ${(stats.supply.transparent / 1000000).toFixed(2)}M ZEC`}
                  />
                </div>
                {/* Legend under bar */}
                <div className="flex justify-between text-[10px] text-muted mt-1.5">
                  <span>{(stats.supply.totalShielded / 1000000).toFixed(2)}M shielded</span>
                  <span>{(stats.supply.transparent / 1000000).toFixed(2)}M transparent</span>
                </div>
              </div>

              {/* Pool Breakdown Cards */}
              <div className="grid grid-cols-3 gap-2">
                <div className="pool-card rounded-lg p-3 text-center">
                  <div className="text-green-400 text-lg font-bold font-mono">
                    {(stats.supply.orchard / 1000000).toFixed(2)}M
                  </div>
                  {zecPrice && (
                    <div className="text-[10px] text-muted font-mono">
                      ${((stats.supply.orchard / 1000000) * zecPrice).toFixed(1)}M
                    </div>
                  )}
                  <div className="flex items-center justify-center gap-1.5 text-xs text-secondary mt-1">
                    <span className="w-2 h-2 rounded-full bg-green-400"></span>
                    Orchard
                  </div>
                </div>
                <div className="pool-card rounded-lg p-3 text-center">
                  <div className="text-cyan-400 text-lg font-bold font-mono">
                    {(stats.supply.sapling / 1000000).toFixed(2)}M
                  </div>
                  {zecPrice && (
                    <div className="text-[10px] text-muted font-mono">
                      ${((stats.supply.sapling / 1000000) * zecPrice).toFixed(1)}M
                    </div>
                  )}
                  <div className="flex items-center justify-center gap-1.5 text-xs text-secondary mt-1">
                    <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
                    Sapling
                  </div>
                </div>
                <div className="pool-card rounded-lg p-3 text-center">
                  <div className="text-amber-400 text-lg font-bold font-mono">
                    {(stats.supply.sprout / 1000).toFixed(1)}K
                  </div>
                  {zecPrice && (
                    <div className="text-[10px] text-muted font-mono">
                      ${((stats.supply.sprout / 1000) * zecPrice).toFixed(0)}K
                    </div>
                  )}
                  <div className="flex items-center justify-center gap-1.5 text-xs text-secondary mt-1">
                    <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                    Sprout
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Chain Stats */}
          <div className="card">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-cyan-500/10 flex items-center justify-center text-cyan-400">
                <Icons.Database />
              </div>
              <h2 className="text-lg font-bold text-primary">Chain Statistics</h2>
            </div>

            <div className="space-y-4">
              {/* Chain Supply */}
              <div className="flex justify-between items-center py-2 border-b border-cipher-border/30">
                <span className="text-secondary">Total Supply</span>
                <span className="font-mono font-bold text-primary">
                  {(stats.supply.chainSupply / 1000000).toFixed(2)}M ZEC
                </span>
              </div>

              {/* Lockbox */}
              <div className="flex justify-between items-center py-2 border-b border-cipher-border/30">
                <div className="flex items-center gap-2">
                  <span className="text-secondary">🔐 Lockbox</span>
                  <span className="text-xs text-muted">(Dev Fund)</span>
                </div>
                <div className="text-right">
                  <span className="font-mono font-bold text-amber-400">
                    {stats.supply.lockbox.toLocaleString(undefined, { maximumFractionDigits: 0 })} ZEC
                  </span>
                  {zecPrice && (
                    <div className="text-[10px] text-muted font-mono">
                      ${((stats.supply.lockbox * zecPrice) / 1000000).toFixed(1)}M
                    </div>
                  )}
                </div>
              </div>

              {/* Active Upgrade */}
              <div className="flex justify-between items-center py-2">
                <span className="text-secondary">Network Upgrade</span>
                <span className="font-mono font-bold text-green-400">
                  {stats.supply.activeUpgrade || 'Unknown'}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Key Metrics - Hero Style */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 mb-8">
        {/* Current Height - Big */}
        <div className="card gradient-card-cyan">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-cyan-500/10 flex items-center justify-center text-cyan-400">
              <Icons.Cube />
            </div>
            <span className="text-sm font-semibold uppercase tracking-wider text-secondary">Current Height</span>
          </div>
          <div className="text-4xl sm:text-5xl font-bold font-mono text-cipher-cyan mb-1">
            {(stats.network.height / 1000000).toFixed(2)}M
          </div>
          <div className="text-sm text-secondary font-mono">
            {stats.network.height.toLocaleString()} blocks
          </div>
        </div>

        {/* Transactions 24h - Big */}
        <div className="card gradient-card-cyan">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-cyan-500/10 flex items-center justify-center text-cyan-400">
              <Icons.Activity />
            </div>
            <span className="text-sm font-semibold uppercase tracking-wider text-secondary">Transactions (24h)</span>
          </div>
          <div className="text-4xl sm:text-5xl font-bold font-mono text-cipher-cyan mb-1">
            {(stats.blockchain.tx24h / 1000).toFixed(1)}K
          </div>
          <div className="text-sm text-secondary">
            {stats.blockchain.tx24h.toLocaleString()} transactions
          </div>
        </div>

        {/* Connected Peers - Big */}
        <div className="card gradient-card-green">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center text-green-400">
              <Icons.Users />
            </div>
            <span className="text-sm font-semibold uppercase tracking-wider text-secondary">Connected Peers</span>
          </div>
          <div className="text-4xl sm:text-5xl font-bold font-mono text-cipher-green mb-1">
            {stats.network.peers}
          </div>
          <div className="text-sm text-secondary">
            Direct connections
          </div>
        </div>
      </div>

      {/* Mining & Performance */}
      <div className="mb-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted flex items-center gap-2">
          <Icons.Zap />
          Mining & Performance
        </h3>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4 mb-8">
        <MiniStatCard
          label="Hashrate"
          value={formatHashrate(stats.mining.networkHashrateRaw)}
          icon={<Icons.Zap />}
        />
        <MiniStatCard
          label="Difficulty"
          value={stats.mining.difficulty.toFixed(1)}
          icon={<Icons.Shield />}
        />
        <MiniStatCard
          label="Block Time"
          value={`${stats.mining.avgBlockTime}s`}
          subtitle="Target: 75s"
          icon={<Icons.Clock />}
          status={stats.mining.avgBlockTime <= 90 ? 'good' : stats.mining.avgBlockTime <= 120 ? 'warning' : 'bad'}
        />
        <MiniStatCard
          label="Blocks (24h)"
          value={stats.mining.blocks24h.toLocaleString()}
          icon={<Icons.Cube />}
        />
        <MiniStatCard
          label="Block Reward"
          value={`${stats.mining.blockReward} ZEC`}
          icon={<Icons.TrendUp />}
        />
        <MiniStatCard
          label="Daily Revenue"
          value={`${(stats.mining.dailyRevenue / 1000).toFixed(1)}K ZEC`}
          subtitle={`$${((stats.mining.dailyRevenue * 50) / 1000).toFixed(1)}K`}
          icon={<Icons.TrendUp />}
        />
      </div>

      {/* Blockchain Info */}
      <div className="mb-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted flex items-center gap-2">
          <Icons.Database />
          Blockchain
        </h3>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
        <MiniStatCard
          label="Blockchain Size"
          value={`${stats.blockchain.sizeGB.toFixed(2)} GB`}
          subtitle={`${(stats.blockchain.sizeBytes / 1e9).toFixed(1)}B bytes`}
          icon={<Icons.Database />}
        />
        <MiniStatCard
          label="Latest Block"
          value={`${Math.floor((Date.now() / 1000 - stats.blockchain.latestBlockTime) / 60)}m ago`}
          subtitle={new Date(stats.blockchain.latestBlockTime * 1000).toLocaleTimeString()}
          icon={<Icons.Clock />}
        />
        <MiniStatCard
          label="TX per Block"
          value={(stats.blockchain.tx24h / stats.mining.blocks24h).toFixed(1)}
          subtitle="24h average"
          icon={<Icons.Activity />}
        />
      </div>

      </div>
    </div>
  );
}

// Mini Stat Card Component (compact, no heavy borders)
interface MiniStatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  subtitle?: string;
  highlight?: boolean;
  status?: 'good' | 'warning' | 'bad';
}

function MiniStatCard({ icon, label, value, subtitle, highlight, status }: MiniStatCardProps) {
  const statusColors = {
    good: 'text-cipher-green',
    warning: 'text-yellow-400',
    bad: 'text-red-400',
  };

  const valueColor = status ? statusColors[status] : highlight ? 'text-green-400' : 'text-primary';

  return (
    <div className={`p-4 rounded-lg border transition-all ${
      highlight
        ? 'stat-card-highlight'
        : 'stat-card'
    }`}>
      <div className="flex items-center gap-2 mb-3">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
          highlight ? 'bg-green-500/10 text-green-400' : 'bg-cyan-500/10 text-cyan-400'
        }`}>
          {icon}
        </div>
        <span className="text-xs font-semibold uppercase tracking-wider text-secondary">{label}</span>
      </div>
      <div className={`text-xl sm:text-2xl font-bold font-mono ${valueColor}`}>
        {value}
      </div>
      {subtitle && (
        <p className={`text-xs mt-1 ${status ? 'text-secondary' : 'text-muted'}`}>
          {subtitle}
        </p>
      )}
    </div>
  );
}
