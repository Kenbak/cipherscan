'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Tooltip } from '@/components/Tooltip';
import { CURRENCY } from '@/lib/config';
import { usePostgresApiClient, getApiUrl } from '@/lib/api-config';
import { LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend } from 'recharts';
import { useWebSocket } from '@/hooks/useWebSocket';
import { RecentShieldedTxs } from '@/components/RecentShieldedTxs';

// Format date for charts (shorter format)
const formatDate = (dateStr: string) => {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};


// Icons
const Icons = {
  Shield: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  ),
  TrendUp: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
    </svg>
  ),
  TrendDown: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
    </svg>
  ),
  Lock: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
    </svg>
  ),
  Eye: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  ),
  Chart: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  ),
  Star: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
    </svg>
  ),
};

interface PrivacyStats {
  lastUpdated: string;
  lastBlockScanned: number;
  totals: {
    blocks: number;
    shieldedTx: number;
    transparentTx: number;
    coinbaseTx: number;
    totalTx: number;
    mixedTx: number;
    fullyShieldedTx: number;
  };
  shieldedPool: {
    currentSize: number;
    sprout?: number;
    sapling?: number;
    orchard?: number;
    transparent?: number;
    chainSupply?: number;
  };
  metrics: {
    shieldedPercentage: number;
    privacyScore: number;
    avgShieldedPerDay: number;
    adoptionTrend: 'growing' | 'stable' | 'declining';
  };
  trends: {
    daily: Array<{
      date: string;
      shielded: number;
      transparent: number;
      poolSize: number;
      shieldedPercentage: number;
      privacyScore: number;
    }>;
  };
}

export default function PrivacyPage() {
  const [stats, setStats] = useState<PrivacyStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zecPrice, setZecPrice] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'adoption' | 'pool' | 'activity' | 'score'>('adoption');

  // WebSocket connection for real-time privacy stats updates
  const { isConnected } = useWebSocket({
    onMessage: (data) => {
      if (data.type === 'privacy_stats') {
        setStats(data.data);
        setLoading(false);
      }
    },
  });

  useEffect(() => {
    // Fetch privacy stats (initial load + fallback)
    // For testnet, call Express API directly; for mainnet, use Next.js API
    const apiUrl = usePostgresApiClient()
      ? `${getApiUrl()}/api/privacy-stats`
      : '/api/privacy-stats';

    fetch(apiUrl)
      .then((res) => res.json())
      .then((data) => {
        // Handle both direct Express API response and Next.js wrapper
        const statsData = data.success ? data.data : data;
        if (statsData && !statsData.error) {
          setStats(statsData);
        } else {
          setError(statsData.error || data.error || 'Failed to load privacy stats');
        }
        setLoading(false);
      })
      .catch((err) => {
        setError('Failed to fetch privacy stats');
        setLoading(false);
      });

    // Fetch ZEC price from CoinGecko directly
    fetch('https://api.coingecko.com/api/v3/simple/price?ids=zcash&vs_currencies=usd')
      .then((res) => res.json())
      .then((data) => {
        setZecPrice(data.zcash.usd);
      })
      .catch((err) => console.error('Failed to load ZEC price:', err));
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-cipher-bg text-white py-12 px-4">
        <div className="max-w-7xl mx-auto text-center">
          <div className="text-2xl">Loading privacy statistics...</div>
        </div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="min-h-screen bg-cipher-bg text-white py-12 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="card text-center">
            <div className="text-5xl mb-4">🛡️</div>
            <h1 className="text-2xl font-bold mb-4">Privacy Stats Unavailable</h1>
            <p className="text-gray-400 mb-6">
              {error || 'Privacy statistics are being calculated. Check back soon!'}
            </p>
            <Link href="/" className="text-cipher-cyan hover:underline">
              ← Back to Explorer
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const trendColor =
    stats.metrics.adoptionTrend === 'growing' ? 'text-cipher-green' :
    stats.metrics.adoptionTrend === 'declining' ? 'text-red-400' :
    'text-gray-400';

  const trendIcon =
    stats.metrics.adoptionTrend === 'growing' ? <Icons.TrendUp /> :
    stats.metrics.adoptionTrend === 'declining' ? <Icons.TrendDown /> :
    <Icons.Chart />;

  return (
    <div className="min-h-screen bg-cipher-bg text-white py-12 px-4">
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <div className="mb-8 sm:mb-12 text-center">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-3 sm:mb-4 font-mono">
            🛡️ Zcash Privacy Metrics
          </h1>
          <p className="text-gray-400 text-base sm:text-lg max-w-3xl mx-auto px-2">
            Live privacy statistics for the Zcash testnet blockchain.
            Track shielded adoption, privacy score, and transparency trends.
          </p>
          <div className="flex items-center justify-center gap-2 mt-3">

          </div>
          <p className="text-xs sm:text-sm text-gray-500 mt-2">
            Last updated: {new Date(stats.lastUpdated).toLocaleString()}
          </p>
        </div>

        {/* Privacy Score + Recent Shielded Activity - Side by Side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6 sm:mb-8">

          {/* Left Column: Privacy Score + Key Metrics */}
          <div className="space-y-6">
            {/* Privacy Score */}
            <div className="card bg-gradient-to-br from-purple-900/20 to-cipher-surface border-2 border-purple-500/30">
              <div className="text-center py-6">
                <div className="flex items-center justify-center gap-2 mb-4">
                  <Icons.Shield />
                  <h2 className="text-xl font-bold text-purple-300">Privacy Score</h2>
                  <Tooltip content="Overall privacy health metric (0-100) based on shielded adoption, fully shielded ratio, and pool size." />
                </div>

                <div className="text-6xl font-bold mb-4 bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                  {stats.metrics.privacyScore}
                  <span className="text-2xl text-gray-500">/100</span>
                </div>

                {/* Progress Bar */}
                <div className="max-w-md mx-auto mb-6">
                  <div className="h-4 bg-cipher-bg rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-1000"
                      style={{ width: `${stats.metrics.privacyScore}%` }}
                    />
                  </div>
                </div>

                <p className="text-sm text-gray-400 max-w-md mx-auto px-4">
                  Shielded Tx Adoption (40%), Fully Shielded Ratio (40%), Pool Size (20%)
                </p>
              </div>
            </div>

            {/* Key Metrics 2x2 Grid */}
            <div className="grid grid-cols-2 gap-4">
              {/* Shielded Percentage */}
              <div className="card">
                <div className="flex items-center gap-2 mb-2">
                  <Icons.Lock />
                  <h3 className="text-xs font-semibold text-gray-400 uppercase">Shielded Tx %</h3>
                </div>
                <div className="text-2xl font-bold text-purple-400">
                  {stats.metrics.shieldedPercentage.toFixed(1)}%
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {stats.totals.shieldedTx.toLocaleString()} txs
                </p>
              </div>

              {/* Supply Shielded % */}
              <div className="card">
                <div className="flex items-center gap-2 mb-2">
                  <Icons.Shield />
                  <h3 className="text-xs font-semibold text-gray-400 uppercase">Supply Shielded</h3>
                </div>
                <div className="text-2xl font-bold text-cipher-cyan">
                  {stats.shieldedPool.chainSupply
                    ? ((stats.shieldedPool.currentSize / stats.shieldedPool.chainSupply) * 100).toFixed(1)
                    : '—'}%
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {(stats.shieldedPool.currentSize / 1000000).toFixed(2)}M / {stats.shieldedPool.chainSupply ? (stats.shieldedPool.chainSupply / 1000000).toFixed(1) : '—'}M
                </p>
              </div>

              {/* Adoption Trend */}
              <div className="card">
                <div className="flex items-center gap-2 mb-2">
                  {trendIcon}
                  <h3 className="text-xs font-semibold text-gray-400 uppercase">Adoption Trend</h3>
                </div>
                <div className={`text-2xl font-bold capitalize ${trendColor}`}>
                  {stats.metrics.adoptionTrend}
                </div>
                <p className="text-xs text-gray-500 mt-1">7d avg</p>
              </div>

              {/* Fully Shielded */}
              <div className="card">
                <div className="flex items-center gap-2 mb-2">
                  <Icons.Eye />
                  <h3 className="text-xs font-semibold text-gray-400 uppercase">Fully Shielded</h3>
                </div>
                <div className="text-2xl font-bold text-cipher-green">
                  {stats.totals.fullyShieldedTx.toLocaleString()}
                </div>
                <p className="text-xs text-gray-500 mt-1">100% private</p>
              </div>
            </div>

          </div>

          {/* Right Column: Recent Shielded Activity */}
          <div className="card bg-gradient-to-br from-purple-500/5 to-purple-600/5 border-purple-500/20">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold font-mono text-purple-400 flex items-center gap-2">
                <Icons.Lock />
                Recent Shielded TXs
              </h2>
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-purple-400 rounded-full animate-pulse"></div>
                <span className="text-xs text-gray-500 font-mono">LIVE</span>
              </div>
            </div>
            <p className="text-xs text-gray-400 mb-4">
              Latest shielded transactions. Click to view or decrypt.
            </p>

            {/* Show only 3-4 TXs */}
            <div className="space-y-3 max-h-[400px] overflow-y-auto">
              <RecentShieldedTxs />
            </div>

            <div className="mt-4 pt-4 border-t border-purple-500/20">
              <Link
                href="/txs/shielded"
                className="block text-center text-sm text-purple-400 hover:text-purple-300 transition-colors font-mono"
              >
                View All Shielded Transactions →
              </Link>
            </div>
          </div>

        </div>

        {/* Transaction Types + Pool Breakdown - Side by Side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Transaction Types */}
          <div className="card">
            <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
              <Icons.Chart />
              Transaction Types
            </h2>

            <div className="space-y-4">
              {/* Shielded */}
              <div>
                <div className="flex justify-between mb-2">
                  <span className="text-purple-400 font-mono flex items-center gap-2">
                    <Icons.Lock />
                    Shielded ({stats.totals.shieldedTx.toLocaleString()})
                  </span>
                  <span className="text-purple-400 font-bold">
                    {stats.metrics.shieldedPercentage.toFixed(1)}%
                  </span>
                </div>
                <div className="h-3 bg-cipher-bg rounded-full overflow-hidden">
                  <div
                    className="h-full bg-purple-500"
                    style={{ width: `${stats.metrics.shieldedPercentage}%` }}
                  />
                </div>
              </div>

              {/* Transparent */}
              <div>
                <div className="flex justify-between mb-2">
                  <span className="text-gray-400 font-mono flex items-center gap-2">
                    <Icons.Eye />
                    Transparent ({stats.totals.transparentTx.toLocaleString()})
                  </span>
                  <span className="text-gray-400 font-bold">
                    {(100 - stats.metrics.shieldedPercentage).toFixed(1)}%
                  </span>
                </div>
                <div className="h-3 bg-cipher-bg rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gray-600"
                    style={{ width: `${100 - stats.metrics.shieldedPercentage}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Shielded Pool Breakdown */}
          {stats.shieldedPool.sapling !== undefined && (
            <div className="card">
              <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                <Icons.Shield />
                Shielded Pool Breakdown
              </h2>

              <div className="space-y-4">
                {/* Sapling */}
                <div>
                  <div className="flex justify-between mb-2">
                    <span className="text-cyan-400 font-mono">Sapling</span>
                    <span className="text-gray-400">
                      {(stats.shieldedPool.sapling! / 1000000).toFixed(2)}M {CURRENCY}
                      <span className="text-cyan-400 font-bold ml-2">
                        ({((stats.shieldedPool.sapling! / stats.shieldedPool.currentSize) * 100).toFixed(0)}%)
                      </span>
                    </span>
                  </div>
                  <div className="h-3 bg-cipher-bg rounded-full overflow-hidden">
                    <div
                      className="h-full bg-cyan-500"
                      style={{ width: `${(stats.shieldedPool.sapling! / stats.shieldedPool.currentSize) * 100}%` }}
                    />
                  </div>
                </div>

                {/* Sprout */}
                <div>
                  <div className="flex justify-between mb-2">
                    <span className="text-amber-400 font-mono">Sprout</span>
                    <span className="text-gray-400">
                      {(stats.shieldedPool.sprout! / 1000).toFixed(0)}K {CURRENCY}
                      <span className="text-amber-400 font-bold ml-2">
                        ({((stats.shieldedPool.sprout! / stats.shieldedPool.currentSize) * 100).toFixed(0)}%)
                      </span>
                    </span>
                  </div>
                  <div className="h-3 bg-cipher-bg rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amber-500"
                      style={{ width: `${(stats.shieldedPool.sprout! / stats.shieldedPool.currentSize) * 100}%` }}
                    />
                  </div>
                </div>

                {/* Orchard */}
                <div>
                  <div className="flex justify-between mb-2">
                    <span className="text-green-400 font-mono">Orchard</span>
                    <span className="text-gray-400">
                      {(stats.shieldedPool.orchard! / 1000).toFixed(0)}K {CURRENCY}
                      <span className="text-green-400 font-bold ml-2">
                        ({((stats.shieldedPool.orchard! / stats.shieldedPool.currentSize) * 100).toFixed(0)}%)
                      </span>
                    </span>
                  </div>
                  <div className="h-3 bg-cipher-bg rounded-full overflow-hidden">
                    <div
                      className="h-full bg-green-500"
                      style={{ width: `${(stats.shieldedPool.orchard! / stats.shieldedPool.currentSize) * 100}%` }}
                    />
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-cipher-border flex justify-between">
                <span className="text-gray-400 font-mono">Total Shielded</span>
                <span className="text-cipher-cyan font-bold">
                  {(stats.shieldedPool.currentSize / 1000000).toFixed(2)}M {CURRENCY}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Charts Section with Tabs */}
        {stats.trends.daily.length > 0 && (
          <div className="card mb-6 sm:mb-8">
            {/* Tabs */}
            <div className="flex gap-2 mb-6 border-b border-cipher-border overflow-x-auto">
              <button
                onClick={() => setActiveTab('adoption')}
                className={`px-4 py-2 font-semibold transition-colors flex items-center gap-2 whitespace-nowrap ${
                  activeTab === 'adoption'
                    ? 'text-cipher-cyan border-b-2 border-cipher-cyan'
                    : 'text-gray-400 hover:text-gray-300'
                }`}
              >
                <div className="w-4 h-4">
                  <Icons.TrendUp />
                </div>
                Adoption Trend
              </button>
              <button
                onClick={() => setActiveTab('pool')}
                className={`px-4 py-2 font-semibold transition-colors flex items-center gap-2 whitespace-nowrap ${
                  activeTab === 'pool'
                    ? 'text-cipher-cyan border-b-2 border-cipher-cyan'
                    : 'text-gray-400 hover:text-gray-300'
                }`}
              >
                <div className="w-4 h-4">
                  <Icons.Shield />
                </div>
                Pool Growth
              </button>
              <button
                onClick={() => setActiveTab('activity')}
                className={`px-4 py-2 font-semibold transition-colors flex items-center gap-2 whitespace-nowrap ${
                  activeTab === 'activity'
                    ? 'text-cipher-cyan border-b-2 border-cipher-cyan'
                    : 'text-gray-400 hover:text-gray-300'
                }`}
              >
                <div className="w-4 h-4">
                  <Icons.Chart />
                </div>
                Daily Activity
              </button>
              <button
                onClick={() => setActiveTab('score')}
                className={`px-4 py-2 font-semibold transition-colors flex items-center gap-2 whitespace-nowrap ${
                  activeTab === 'score'
                    ? 'text-cipher-cyan border-b-2 border-cipher-cyan'
                    : 'text-gray-400 hover:text-gray-300'
                }`}
              >
                <div className="w-4 h-4">
                  <Icons.Star />
                </div>
                Privacy Score
              </button>
            </div>

            {/* Chart Content */}
            {activeTab === 'adoption' && (
              <ResponsiveContainer width="100%" height={350}>
                <LineChart data={[...stats.trends.daily].reverse()}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis
                    dataKey="date"
                    stroke="#9CA3AF"
                    tick={{ fill: '#9CA3AF', fontSize: 11 }}
                    tickFormatter={formatDate}
                    angle={-45}
                    textAnchor="end"
                    height={60}
                  />
                  <YAxis
                    stroke="#9CA3AF"
                    tick={{ fill: '#9CA3AF', fontSize: 12 }}
                    label={{ value: 'Shielded %', angle: -90, position: 'insideLeft', fill: '#9CA3AF' }}
                  />
                  <RechartsTooltip
                    contentStyle={{
                      backgroundColor: '#1F2937',
                      border: '1px solid #374151',
                      borderRadius: '8px',
                      color: '#fff'
                    }}
                    labelFormatter={(label) => formatDate(label)}
                    formatter={(value: any) => [`${Number(value).toFixed(2)}%`, 'Shielded']}
                  />
                  <Line
                    type="monotone"
                    dataKey="shieldedPercentage"
                    stroke="#A78BFA"
                    strokeWidth={3}
                    dot={{ fill: '#A78BFA', r: 3 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}

            {activeTab === 'pool' && (
              <ResponsiveContainer width="100%" height={350}>
                <AreaChart data={[...stats.trends.daily].reverse()}>
                  <defs>
                    <linearGradient id="colorPool" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10B981" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis
                    dataKey="date"
                    stroke="#9CA3AF"
                    tick={{ fill: '#9CA3AF', fontSize: 11 }}
                    tickFormatter={formatDate}
                    angle={-45}
                    textAnchor="end"
                    height={60}
                  />
                  <YAxis
                    stroke="#9CA3AF"
                    tick={{ fill: '#9CA3AF', fontSize: 12 }}
                    tickFormatter={(value) => `${(value / 1000000).toFixed(1)}M`}
                    label={{ value: 'Pool Size (ZEC)', angle: -90, position: 'insideLeft', fill: '#9CA3AF' }}
                  />
                  <RechartsTooltip
                    contentStyle={{
                      backgroundColor: '#1F2937',
                      border: '1px solid #374151',
                      borderRadius: '8px',
                      color: '#fff'
                    }}
                    labelFormatter={(label) => formatDate(label)}
                    formatter={(value: any) => [`${(Number(value) / 1000000).toFixed(2)}M ZEC`, 'Pool Size']}
                  />
                  <Area
                    type="monotone"
                    dataKey="poolSize"
                    stroke="#10B981"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorPool)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}

            {activeTab === 'activity' && (
              <ResponsiveContainer width="100%" height={350}>
                <BarChart data={[...stats.trends.daily].reverse()}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis
                    dataKey="date"
                    stroke="#9CA3AF"
                    tick={{ fill: '#9CA3AF', fontSize: 11 }}
                    tickFormatter={formatDate}
                    angle={-45}
                    textAnchor="end"
                    height={60}
                  />
                  <YAxis
                    stroke="#9CA3AF"
                    tick={{ fill: '#9CA3AF', fontSize: 12 }}
                    label={{ value: 'Transactions', angle: -90, position: 'insideLeft', fill: '#9CA3AF' }}
                  />
                  <RechartsTooltip
                    cursor={{ fill: 'rgba(139, 92, 246, 0.1)' }}
                    contentStyle={{
                      backgroundColor: '#1F2937',
                      border: '1px solid #4B5563',
                      borderRadius: '8px',
                      padding: '12px'
                    }}
                    labelStyle={{ color: '#E5E7EB', fontWeight: 'bold', marginBottom: '8px' }}
                    itemStyle={{ color: '#D1D5DB' }}
                    labelFormatter={(label) => formatDate(label)}
                    formatter={(value: any, name: string) => {
                      const color = name === 'shielded' ? '#A78BFA' : '#9CA3AF';
                      const icon = name === 'shielded' ? '🛡️' : '👁️';
                      const displayName = name === 'shielded' ? 'Shielded' : 'Transparent';
                      return [
                        <span style={{ color, fontWeight: '600' }}>
                          {icon} {Number(value).toLocaleString()} txs
                        </span>,
                        displayName
                      ];
                    }}
                  />
                  <Legend
                    wrapperStyle={{ color: '#9CA3AF' }}
                    formatter={(value) => value === 'shielded' ? '🛡️ Shielded' : '👁️ Transparent'}
                  />
                  <Bar
                    dataKey="shielded"
                    fill="#A78BFA"
                    name="shielded"
                    radius={[4, 4, 0, 0]}
                    activeBar={{ fill: '#8B5CF6' }}
                  />
                  <Bar
                    dataKey="transparent"
                    fill="#6B7280"
                    name="transparent"
                    radius={[4, 4, 0, 0]}
                    activeBar={{ fill: '#4B5563' }}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}

            {activeTab === 'score' && (
              <div>
                <div className="mb-4 text-sm text-gray-400">
                  Privacy Score combines shielded adoption rate, pool growth, and transaction privacy to measure overall network privacy health (0-100).
                </div>
                <ResponsiveContainer width="100%" height={350}>
                  <AreaChart data={[...stats.trends.daily].reverse()}>
                    <defs>
                      <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#A78BFA" stopOpacity={0.4}/>
                        <stop offset="95%" stopColor="#A78BFA" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis
                      dataKey="date"
                      stroke="#9CA3AF"
                      tick={{ fill: '#9CA3AF', fontSize: 11 }}
                      tickFormatter={formatDate}
                      angle={-45}
                      textAnchor="end"
                      height={60}
                    />
                    <YAxis
                      stroke="#9CA3AF"
                      tick={{ fill: '#9CA3AF', fontSize: 12 }}
                      domain={[0, 100]}
                      label={{ value: 'Privacy Score', angle: -90, position: 'insideLeft', fill: '#9CA3AF' }}
                    />
                    <RechartsTooltip
                      contentStyle={{
                        backgroundColor: '#1F2937',
                        border: '1px solid #374151',
                        borderRadius: '8px',
                        color: '#fff',
                        padding: '12px'
                      }}
                      labelFormatter={(label) => formatDate(label)}
                      formatter={(value: any) => {
                        const score = Number(value);
                        let rating = '🔴 Low';
                        if (score >= 70) rating = '🟢 Excellent';
                        else if (score >= 50) rating = '🟡 Good';
                        else if (score >= 30) rating = '🟠 Fair';
                        return [`${score.toFixed(1)} / 100 (${rating})`, 'Privacy Score'];
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="privacyScore"
                      stroke="#A78BFA"
                      strokeWidth={3}
                      fillOpacity={1}
                      fill="url(#colorScore)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}

        {/* Info Footer */}
        <div className="card-glass border-cipher-border/50">
          <h3 className="text-lg font-bold mb-3">About Privacy Metrics</h3>
          <div className="space-y-2 text-sm text-gray-400">
            <p>
              <strong className="text-white">Privacy Score:</strong> A composite metric (0-100) based on transaction privacy adoption,
              fully shielded usage, and shielded pool size.
            </p>
            <p>
              <strong className="text-white">Shielded Pool:</strong> Total amount of {CURRENCY} currently in shielded addresses,
              providing a larger anonymity set.
            </p>
            <p>
              <strong className="text-white">Adoption Trend:</strong> Compares the last 7 days to the previous 7 days.
              Growing if +10%, declining if -10%, otherwise stable.
            </p>
            <p className="text-xs text-gray-500 mt-4">
              Stats calculated from {stats.totals.blocks.toLocaleString()} blocks. Updates automatically every 10 blocks.
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}
