'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CURRENCY } from '@/lib/config';
import { usePostgresApiClient, getApiUrl } from '@/lib/api-config';
import { LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend } from 'recharts';
import { useWebSocket } from '@/hooks/useWebSocket';
import { RecentShieldedTxs } from '@/components/RecentShieldedTxs';
import { useTheme } from '@/contexts/ThemeContext';
import { Card, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';

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
  const { theme } = useTheme();

  // Chart colors based on theme
  const chartColors = {
    grid: theme === 'light' ? '#E5E7EB' : '#374151',
    axis: theme === 'light' ? '#6B7280' : '#9CA3AF',
    tooltipBg: theme === 'light' ? '#FFFFFF' : '#1F2937',
    tooltipBorder: theme === 'light' ? '#E5E7EB' : '#374151',
    tooltipText: theme === 'light' ? '#111827' : '#fff',
  };

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
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-purple-400 border-t-transparent"></div>
          <p className="text-secondary ml-4 font-mono">Loading privacy statistics...</p>
        </div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <Card className="text-center">
          <CardBody className="py-16">
            <h1 className="text-2xl font-bold mb-4 text-primary">Privacy Stats Unavailable</h1>
            <p className="text-secondary mb-6">
              {error || 'Privacy statistics are being calculated. Check back soon!'}
            </p>
            <Link href="/" className="text-cipher-cyan hover:underline font-mono">
              Back to Explorer
            </Link>
          </CardBody>
        </Card>
      </div>
    );
  }

  const trendColor =
    stats.metrics.adoptionTrend === 'growing' ? 'text-cipher-green' :
    stats.metrics.adoptionTrend === 'declining' ? 'text-red-400' :
    'text-secondary';

  const trendIcon =
    stats.metrics.adoptionTrend === 'growing' ? <Icons.TrendUp /> :
    stats.metrics.adoptionTrend === 'declining' ? <Icons.TrendDown /> :
    <Icons.Chart />;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">

        {/* Header - cypherpunk style */}
        <div className="mb-8 animate-fade-in">
          <p className="text-xs text-muted font-mono uppercase tracking-widest mb-3">
            <span className="opacity-50">{'>'}</span> PRIVACY_DASHBOARD
          </p>
          <div className="flex items-center justify-between">
            <h1 className="text-2xl sm:text-3xl font-bold text-primary">
              Privacy Metrics
            </h1>
            <div className="flex items-center gap-3">
              <div className={`flex items-center gap-1.5 ${trendColor}`}>
                {trendIcon}
                <span className="text-xs font-mono capitalize">{stats.metrics.adoptionTrend}</span>
              </div>
              <span className="text-xs text-muted font-mono">
                {new Date(stats.lastUpdated).toLocaleTimeString()}
              </span>
            </div>
          </div>
        </div>

        {/* Privacy Score + Key Metrics | Recent Shielded Activity */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8 animate-fade-in-up" style={{ animationDelay: '50ms' }}>

          {/* Left Column: Privacy Score + Key Metrics */}
          <div className="space-y-6">
            {/* Privacy Score Hero */}
            <Card>
              <CardBody className="text-center py-8">
                <div className="flex items-center justify-center gap-2 mb-4">
                  <span className="text-xs text-muted font-mono uppercase tracking-widest opacity-50">{'>'}</span>
                  <h2 className="text-sm font-bold font-mono text-purple-400 uppercase tracking-wider">PRIVACY_SCORE</h2>
                </div>

                <div className="text-7xl font-bold mb-4 bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                  {stats.metrics.privacyScore}
                  <span className="text-3xl text-muted">/100</span>
                </div>

                <div className="max-w-md mx-auto mb-6">
                  <div className="h-4 privacy-progress-bg rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-1000"
                      style={{ width: `${stats.metrics.privacyScore}%` }}
                    />
                  </div>
                </div>

                <p className="text-sm text-muted max-w-md mx-auto">
                  Shielded Tx Adoption (40%), Fully Shielded Ratio (40%), Pool Size (20%)
                </p>
              </CardBody>
            </Card>

            {/* Key Metrics 2x2 Grid */}
            <div className="grid grid-cols-2 gap-4">
              <Card variant="compact">
                <CardBody>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-400">
                      <Icons.Lock />
                    </div>
                    <h3 className="text-xs font-semibold text-secondary uppercase">Shielded Tx %</h3>
                  </div>
                  <div className="text-2xl font-bold text-purple-400">
                    {stats.metrics.shieldedPercentage.toFixed(1)}%
                  </div>
                  <p className="text-xs text-muted mt-1">
                    {stats.totals.shieldedTx.toLocaleString()} txs
                  </p>
                </CardBody>
              </Card>

              <Card variant="compact">
                <CardBody>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 rounded-lg bg-cipher-cyan/10 flex items-center justify-center text-cipher-cyan">
                      <Icons.Shield />
                    </div>
                    <h3 className="text-xs font-semibold text-secondary uppercase">Supply Shielded</h3>
                  </div>
                  <div className="text-2xl font-bold text-cipher-cyan">
                    {stats.shieldedPool.chainSupply
                      ? ((stats.shieldedPool.currentSize / stats.shieldedPool.chainSupply) * 100).toFixed(1)
                      : '\u2014'}%
                  </div>
                  <p className="text-xs text-muted mt-1">
                    {(stats.shieldedPool.currentSize / 1000000).toFixed(2)}M / {stats.shieldedPool.chainSupply ? (stats.shieldedPool.chainSupply / 1000000).toFixed(1) : '\u2014'}M
                  </p>
                </CardBody>
              </Card>

              <Card variant="compact">
                <CardBody>
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                      stats.metrics.adoptionTrend === 'growing' ? 'bg-cipher-green/10 text-cipher-green' :
                      stats.metrics.adoptionTrend === 'declining' ? 'bg-red-500/10 text-red-400' :
                      'bg-cipher-surface text-secondary'
                    }`}>
                      {trendIcon}
                    </div>
                    <h3 className="text-xs font-semibold text-secondary uppercase">Adoption Trend</h3>
                  </div>
                  <div className={`text-2xl font-bold capitalize ${trendColor}`}>
                    {stats.metrics.adoptionTrend}
                  </div>
                  <p className="text-xs text-muted mt-1">7d avg</p>
                </CardBody>
              </Card>

              <Card variant="compact">
                <CardBody>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 rounded-lg bg-cipher-green/10 flex items-center justify-center text-cipher-green">
                      <Icons.Eye />
                    </div>
                    <h3 className="text-xs font-semibold text-secondary uppercase">Fully Shielded</h3>
                  </div>
                  <div className="text-2xl font-bold text-cipher-green">
                    {stats.totals.fullyShieldedTx.toLocaleString()}
                  </div>
                  <p className="text-xs text-muted mt-1">100% private</p>
                </CardBody>
              </Card>
            </div>
          </div>

          {/* Right Column: Recent Shielded Activity */}
          <Card>
            <CardBody>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted font-mono uppercase tracking-widest opacity-50">{'>'}</span>
                  <h2 className="text-sm font-bold font-mono text-purple-400 uppercase tracking-wider">SHIELDED_ACTIVITY</h2>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-purple-400 rounded-full animate-pulse"></div>
                  <Badge color="purple">LIVE</Badge>
                </div>
              </div>
              <p className="text-xs text-secondary mb-4">
                Latest shielded transactions. Click to view or decrypt.
              </p>
              <div className="space-y-3 max-h-[400px] overflow-y-auto">
                <RecentShieldedTxs nested />
              </div>
              <div className="mt-4 pt-4 border-t border-black/5 dark:border-white/5">
                <Link
                  href="/txs/shielded"
                  className="block text-center text-sm text-purple-400 hover:text-purple-300 transition-colors font-mono"
                >
                  View All Shielded Transactions →
                </Link>
              </div>
            </CardBody>
          </Card>
        </div>

        {/* Transaction Types + Pool Breakdown */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 mb-8 animate-fade-in-up" style={{ animationDelay: '100ms' }}>
          {/* Transaction Types */}
          <Card>
            <CardBody>
              <div className="flex items-center gap-2 mb-5">
                <span className="text-xs text-muted font-mono uppercase tracking-widest opacity-50">{'>'}</span>
                <h2 className="text-sm font-bold font-mono text-purple-400 uppercase tracking-wider">TX_TYPES</h2>
              </div>
              <div className="space-y-5">
                <div>
                  <div className="flex justify-between mb-2">
                    <span className="text-purple-400 font-mono flex items-center gap-2 text-sm">
                      <Icons.Lock />
                      Shielded ({stats.totals.shieldedTx.toLocaleString()})
                    </span>
                    <Badge color="purple">{stats.metrics.shieldedPercentage.toFixed(1)}%</Badge>
                  </div>
                  <div className="h-3 privacy-progress-bg rounded-full overflow-hidden">
                    <div
                      className="h-full bg-purple-500 transition-all duration-700"
                      style={{ width: `${stats.metrics.shieldedPercentage}%` }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between mb-2">
                    <span className="text-secondary font-mono flex items-center gap-2 text-sm">
                      <Icons.Eye />
                      Transparent ({stats.totals.transparentTx.toLocaleString()})
                    </span>
                    <Badge color="muted">{(100 - stats.metrics.shieldedPercentage).toFixed(1)}%</Badge>
                  </div>
                  <div className="h-3 privacy-progress-bg rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gray-500 transition-all duration-700"
                      style={{ width: `${100 - stats.metrics.shieldedPercentage}%` }}
                    />
                  </div>
                </div>
              </div>
            </CardBody>
          </Card>

          {/* Shielded Pool Breakdown */}
          {stats.shieldedPool.sapling !== undefined && (
            <Card>
              <CardBody>
                <div className="flex items-center gap-2 mb-5">
                  <span className="text-xs text-muted font-mono uppercase tracking-widest opacity-50">{'>'}</span>
                  <h2 className="text-sm font-bold font-mono text-cipher-cyan uppercase tracking-wider">POOL_BREAKDOWN</h2>
                </div>
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between mb-2 items-center">
                      <span className="text-cyan-400 font-mono text-sm">Sapling</span>
                      <div className="flex items-center gap-2">
                        <span className="text-secondary text-sm">
                          {(stats.shieldedPool.sapling! / 1000000).toFixed(2)}M {CURRENCY}
                        </span>
                        <Badge color="cyan">
                          {((stats.shieldedPool.sapling! / stats.shieldedPool.currentSize) * 100).toFixed(0)}%
                        </Badge>
                      </div>
                    </div>
                    <div className="h-3 privacy-progress-bg rounded-full overflow-hidden">
                      <div
                        className="h-full bg-cyan-500 transition-all duration-700"
                        style={{ width: `${(stats.shieldedPool.sapling! / stats.shieldedPool.currentSize) * 100}%` }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between mb-2 items-center">
                      <span className="text-amber-400 font-mono text-sm">Sprout</span>
                      <div className="flex items-center gap-2">
                        <span className="text-secondary text-sm">
                          {(stats.shieldedPool.sprout! / 1000).toFixed(0)}K {CURRENCY}
                        </span>
                        <Badge color="orange">
                          {((stats.shieldedPool.sprout! / stats.shieldedPool.currentSize) * 100).toFixed(0)}%
                        </Badge>
                      </div>
                    </div>
                    <div className="h-3 privacy-progress-bg rounded-full overflow-hidden">
                      <div
                        className="h-full bg-amber-500 transition-all duration-700"
                        style={{ width: `${(stats.shieldedPool.sprout! / stats.shieldedPool.currentSize) * 100}%` }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between mb-2 items-center">
                      <span className="text-green-400 font-mono text-sm">Orchard</span>
                      <div className="flex items-center gap-2">
                        <span className="text-secondary text-sm">
                          {(stats.shieldedPool.orchard! / 1000).toFixed(0)}K {CURRENCY}
                        </span>
                        <Badge color="green">
                          {((stats.shieldedPool.orchard! / stats.shieldedPool.currentSize) * 100).toFixed(0)}%
                        </Badge>
                      </div>
                    </div>
                    <div className="h-3 privacy-progress-bg rounded-full overflow-hidden">
                      <div
                        className="h-full bg-green-500 transition-all duration-700"
                        style={{ width: `${(stats.shieldedPool.orchard! / stats.shieldedPool.currentSize) * 100}%` }}
                      />
                    </div>
                  </div>

                  <div className="pt-4 border-t border-black/5 dark:border-white/5 flex justify-between items-center">
                    <span className="text-secondary font-mono text-sm">Total Shielded</span>
                    <span className="text-primary font-bold font-mono">
                      {(stats.shieldedPool.currentSize / 1000000).toFixed(2)}M {CURRENCY}
                    </span>
                  </div>
                </div>
              </CardBody>
            </Card>
          )}
        </div>

        {/* Charts Section with Tabs */}
        {stats.trends.daily.length > 0 && (
          <div className="mb-8 animate-fade-in-up" style={{ animationDelay: '200ms' }}>
            <div className="flex items-center gap-2 mb-4">
              <span className="text-xs text-muted font-mono uppercase tracking-widest opacity-50">{'>'}</span>
              <h2 className="text-sm font-bold font-mono text-cipher-cyan uppercase tracking-wider">HISTORICAL_TRENDS</h2>
            </div>
            <Card>
              <CardBody>
              {/* Pill Tabs */}
              <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
                {([
                  { key: 'adoption', label: 'Adoption' },
                  { key: 'pool', label: 'Pool Growth' },
                  { key: 'activity', label: 'Daily Activity' },
                  { key: 'score', label: 'Privacy Score' },
                ] as const).map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`px-4 py-1.5 text-xs font-mono font-semibold rounded-full transition-all whitespace-nowrap ${
                      activeTab === tab.key
                        ? 'bg-cipher-cyan/10 text-cipher-cyan border border-cipher-cyan/30'
                        : 'text-muted hover:text-secondary border border-transparent'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Chart Content */}
              {activeTab === 'adoption' && (
                <ResponsiveContainer width="100%" height={350}>
                  <LineChart data={[...stats.trends.daily].reverse()}>
                    <CartesianGrid strokeDasharray="2 6" stroke={chartColors.grid} opacity={0.5} />
                    <XAxis
                      dataKey="date"
                      stroke={chartColors.axis}
                      tick={{ fill: chartColors.axis, fontSize: 11 }}
                      tickFormatter={formatDate}
                      angle={-45}
                      textAnchor="end"
                      height={60}
                    />
                    <YAxis
                      stroke={chartColors.axis}
                      tick={{ fill: chartColors.axis, fontSize: 12 }}
                      label={{ value: 'Shielded %', angle: -90, position: 'insideLeft', fill: chartColors.axis }}
                    />
                    <RechartsTooltip
                      contentStyle={{
                        backgroundColor: chartColors.tooltipBg,
                        border: `1px solid ${chartColors.tooltipBorder}`,
                        borderRadius: '8px',
                        color: chartColors.tooltipText
                      }}
                      labelFormatter={(label) => formatDate(label)}
                      formatter={(value: any) => [
                        <span key="v" style={{ color: chartColors.tooltipText }}>{Number(value).toFixed(2)}%</span>,
                        'Shielded'
                      ]}
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

              {activeTab === 'pool' && (() => {
                const poolData = [...stats.trends.daily].reverse();
                const poolValues = poolData.map(d => d.poolSize);
                const minPool = Math.min(...poolValues);
                const maxPool = Math.max(...poolValues);
                const range = maxPool - minPool;
                const padding = Math.max(range * 0.1, maxPool * 0.001);
                const yMin = Math.floor((minPool - padding) / 10000) * 10000;
                const yMax = Math.ceil((maxPool + padding) / 10000) * 10000;

                return (
                <ResponsiveContainer width="100%" height={350}>
                  <AreaChart data={poolData}>
                    <defs>
                      <linearGradient id="colorPool" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#00E676" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#00E676" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="2 6" stroke={chartColors.grid} opacity={0.5} />
                    <XAxis
                      dataKey="date"
                      stroke={chartColors.axis}
                      tick={{ fill: chartColors.axis, fontSize: 11 }}
                      tickFormatter={formatDate}
                      angle={-45}
                      textAnchor="end"
                      height={60}
                    />
                    <YAxis
                      stroke={chartColors.axis}
                      tick={{ fill: chartColors.axis, fontSize: 12 }}
                      tickFormatter={(value) => `${(value / 1000000).toFixed(2)}M`}
                      domain={[yMin, yMax]}
                      label={{ value: 'Pool Size (ZEC)', angle: -90, position: 'insideLeft', fill: chartColors.axis }}
                    />
                    <RechartsTooltip
                      contentStyle={{
                        backgroundColor: chartColors.tooltipBg,
                        border: `1px solid ${chartColors.tooltipBorder}`,
                        borderRadius: '8px',
                        color: chartColors.tooltipText
                      }}
                      labelFormatter={(label) => formatDate(label)}
                      formatter={(value: any) => [
                        <span key="v" style={{ color: chartColors.tooltipText }}>{(Number(value) / 1000000).toFixed(4)}M ZEC</span>,
                        'Pool Size'
                      ]}
                    />
                    <Area
                      type="monotone"
                      dataKey="poolSize"
                      stroke="#00E676"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#colorPool)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
                );
              })()}

              {activeTab === 'activity' && (
                <ResponsiveContainer width="100%" height={350}>
                  <BarChart data={[...stats.trends.daily].reverse()}>
                    <CartesianGrid strokeDasharray="2 6" stroke={chartColors.grid} opacity={0.5} />
                    <XAxis
                      dataKey="date"
                      stroke={chartColors.axis}
                      tick={{ fill: chartColors.axis, fontSize: 11 }}
                      tickFormatter={formatDate}
                      angle={-45}
                      textAnchor="end"
                      height={60}
                    />
                    <YAxis
                      stroke={chartColors.axis}
                      tick={{ fill: chartColors.axis, fontSize: 12 }}
                      label={{ value: 'Transactions', angle: -90, position: 'insideLeft', fill: chartColors.axis }}
                    />
                    <RechartsTooltip
                      cursor={{ fill: 'rgba(139, 92, 246, 0.1)' }}
                      contentStyle={{
                        backgroundColor: chartColors.tooltipBg,
                        border: `1px solid ${chartColors.tooltipBorder}`,
                        borderRadius: '8px',
                        padding: '12px',
                        color: chartColors.tooltipText
                      }}
                      labelStyle={{ color: chartColors.tooltipText, fontWeight: 'bold', marginBottom: '8px' }}
                      labelFormatter={(label) => formatDate(label)}
                      formatter={(value: any, name: string) => {
                        const color = name === 'shielded' ? '#A78BFA' : chartColors.axis;
                        const displayName = name === 'shielded' ? 'Shielded' : 'Transparent';
                        return [
                          <span key="v" style={{ color, fontWeight: '600' }}>
                            {Number(value).toLocaleString()} txs
                          </span>,
                          displayName
                        ];
                      }}
                    />
                    <Legend
                      wrapperStyle={{ color: chartColors.axis }}
                      formatter={(value) => {
                        const dotColor = value === 'shielded' ? '#A78BFA' : '#6B7280';
                        return <span style={{ color: chartColors.tooltipText }}><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', backgroundColor: dotColor, marginRight: 6 }} />{value === 'shielded' ? 'Shielded' : 'Transparent'}</span>;
                      }}
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
                  <div className="mb-4 text-sm text-secondary">
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
                      <CartesianGrid strokeDasharray="2 6" stroke={chartColors.grid} opacity={0.5} />
                      <XAxis
                        dataKey="date"
                        stroke={chartColors.axis}
                        tick={{ fill: chartColors.axis, fontSize: 11 }}
                        tickFormatter={formatDate}
                        angle={-45}
                        textAnchor="end"
                        height={60}
                      />
                      <YAxis
                        stroke={chartColors.axis}
                        tick={{ fill: chartColors.axis, fontSize: 12 }}
                        domain={[0, 100]}
                        label={{ value: 'Privacy Score', angle: -90, position: 'insideLeft', fill: chartColors.axis }}
                      />
                      <RechartsTooltip
                        contentStyle={{
                          backgroundColor: chartColors.tooltipBg,
                          border: `1px solid ${chartColors.tooltipBorder}`,
                          borderRadius: '8px',
                          color: chartColors.tooltipText,
                          padding: '12px'
                        }}
                        labelFormatter={(label) => formatDate(label)}
                        formatter={(value: any) => {
                          const score = Number(value);
                          let rating = 'Low';
                          let ratingColor = '#EF4444';
                          if (score >= 70) { rating = 'Excellent'; ratingColor = '#00E676'; }
                          else if (score >= 50) { rating = 'Good'; ratingColor = '#FBBF24'; }
                          else if (score >= 30) { rating = 'Fair'; ratingColor = '#FB923C'; }
                          return [
                            <span key="v" style={{ color: chartColors.tooltipText }}>
                              {score.toFixed(1)} / 100 (<span style={{ color: ratingColor }}>{rating}</span>)
                            </span>,
                            'Privacy Score'
                          ];
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
              </CardBody>
            </Card>
          </div>
        )}

        {/* Info Footer */}
        <div className="animate-fade-in-up" style={{ animationDelay: '250ms' }}>
        <Card variant="glass">
          <CardBody>
            <h3 className="text-lg font-bold mb-4 text-primary">About Privacy Metrics</h3>
            <div className="space-y-3 text-sm text-secondary">
              <p>
                <strong className="text-primary">Privacy Score:</strong> A composite metric (0-100) based on transaction privacy adoption,
                fully shielded usage, and shielded pool size.
              </p>
              <p>
                <strong className="text-primary">Shielded Pool:</strong> Total amount of {CURRENCY} currently in shielded addresses,
                providing a larger anonymity set.
              </p>
              <p>
                <strong className="text-primary">Adoption Trend:</strong> Compares the last 7 days to the previous 7 days.
                Growing if +10%, declining if -10%, otherwise stable.
              </p>
              <p className="text-xs text-muted mt-4 pt-4 border-t border-cipher-border">
                Stats calculated from {stats.totals.blocks.toLocaleString()} blocks. Updates automatically every 10 blocks.
              </p>
            </div>
          </CardBody>
        </Card>
        </div>

    </div>
  );
}
