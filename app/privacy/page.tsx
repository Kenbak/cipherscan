'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Tooltip } from '@/components/Tooltip';
import { CURRENCY } from '@/lib/config';
import { usePostgresApiClient, getApiUrl } from '@/lib/api-config';

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
    }>;
  };
}

export default function PrivacyPage() {
  const [stats, setStats] = useState<PrivacyStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zecPrice, setZecPrice] = useState<number | null>(null);

  useEffect(() => {
    // Fetch privacy stats
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
          <p className="text-xs sm:text-sm text-gray-500 mt-2">
            Last updated: {new Date(stats.lastUpdated).toLocaleString()}
          </p>
        </div>

        {/* Privacy Score - Hero */}
        <div className="card mb-6 sm:mb-8 bg-gradient-to-br from-purple-900/20 to-cipher-surface border-2 border-purple-500/30">
          <div className="text-center py-6 sm:py-8">
            <div className="flex items-center justify-center gap-2 sm:gap-3 mb-3 sm:mb-4">
              <Icons.Shield />
              <h2 className="text-xl sm:text-2xl font-bold text-purple-300">Privacy Score</h2>
              <Tooltip content="Overall privacy health metric (0-100) based on shielded adoption, fully shielded ratio, and pool size." />
            </div>

            <div className="text-5xl sm:text-6xl md:text-7xl font-bold mb-3 sm:mb-4 bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
              {stats.metrics.privacyScore}
              <span className="text-2xl sm:text-3xl text-gray-500">/100</span>
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

            <p className="text-sm sm:text-base text-gray-400 max-w-2xl mx-auto px-2">
              Calculated based on: <strong>Shielded Tx Adoption</strong> (40%),
              <strong> Fully Shielded Ratio</strong> (40%), and <strong>Shielded Pool Size</strong> (20%).
            </p>
          </div>
        </div>

        {/* Key Metrics Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-6 sm:mb-8">

          {/* Shielded Percentage */}
          <div className="card">
            <div className="flex items-center gap-2 mb-2">
              <Icons.Lock />
              <h3 className="text-sm font-semibold text-gray-400 uppercase">Shielded Txs</h3>
              <Tooltip content="Transactions that use at least one shielded input or output. Provides partial privacy." />
            </div>
            <div className="text-2xl sm:text-3xl font-bold text-purple-400">
              {stats.metrics.shieldedPercentage.toFixed(1)}%
            </div>
            <p className="text-sm text-gray-500 mt-2">
              {stats.totals.shieldedTx.toLocaleString()} of {stats.totals.totalTx.toLocaleString()} total
            </p>
          </div>

          {/* Pool Size */}
          <div className="card">
            <div className="flex items-center gap-2 mb-2">
              <Icons.Shield />
              <h3 className="text-sm font-semibold text-gray-400 uppercase">Shielded Pool</h3>
              <Tooltip content="Total ZEC stored in shielded pools (Sapling + Orchard). These funds are completely private and untraceable." />
            </div>
            <div className="text-2xl sm:text-3xl font-bold text-cipher-cyan">
              {(stats.shieldedPool.currentSize / 1000000).toFixed(2)}M {CURRENCY}
            </div>
            {zecPrice && (
              <p className="text-sm text-gray-500 mt-2">
                ${((stats.shieldedPool.currentSize * zecPrice) / 1000000).toFixed(2)}M USD
              </p>
            )}
          </div>

          {/* Adoption Trend */}
          <div className="card">
            <div className="flex items-center gap-2 mb-2">
              {trendIcon}
              <h3 className="text-sm font-semibold text-gray-400 uppercase">Adoption Trend</h3>
              <Tooltip content="Recent trend in shielded transaction usage. Based on 7-day vs 30-day averages." />
            </div>
            <div className={`text-2xl sm:text-3xl font-bold capitalize ${trendColor}`}>
              {stats.metrics.adoptionTrend}
            </div>
            <p className="text-sm text-gray-500 mt-2">
              {stats.metrics.avgShieldedPerDay} shielded/day avg
            </p>
          </div>

          {/* Fully Shielded */}
          <div className="card">
            <div className="flex items-center gap-2 mb-2">
              <Icons.Eye />
              <h3 className="text-sm font-semibold text-gray-400 uppercase">Fully Shielded</h3>
              <Tooltip content="Transactions where ALL inputs and outputs are shielded. Provides maximum privacy - completely untraceable." />
            </div>
            <div className="text-2xl sm:text-3xl font-bold text-cipher-green">
              {((stats.totals.fullyShieldedTx / stats.totals.shieldedTx) * 100).toFixed(1)}%
            </div>
            <p className="text-sm text-gray-500 mt-2">
              {stats.totals.fullyShieldedTx.toLocaleString()} 100% private
            </p>
          </div>
        </div>

        {/* Transaction Breakdown */}
        <div className="card mb-8">
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

        {/* Recent Trends */}
        {stats.trends.daily.length > 0 && (
          <div className="card mb-6 sm:mb-8">
            <h2 className="text-lg sm:text-xl font-bold mb-4 sm:mb-6">Recent Privacy Trends (Last 7 Days)</h2>

            <div className="overflow-x-auto -mx-4 sm:mx-0">
              <div className="min-w-[600px] px-4 sm:px-0">
                <table className="w-full">
                <thead>
                  <tr className="text-left text-sm text-gray-500 border-b border-gray-800">
                    <th className="pb-3">Date</th>
                    <th className="pb-3">Shielded</th>
                    <th className="pb-3">Transparent</th>
                    <th className="pb-3">Privacy %</th>
                    <th className="pb-3">Pool Size</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.trends.daily.slice(-7).reverse().map((day) => (
                    <tr key={day.date} className="border-b border-gray-800/50">
                      <td className="py-3 text-sm font-mono">{day.date}</td>
                      <td className="py-3 text-purple-400">{day.shielded.toLocaleString()}</td>
                      <td className="py-3 text-gray-400">{day.transparent.toLocaleString()}</td>
                      <td className="py-3 text-cipher-cyan">{day.shieldedPercentage.toFixed(2)}%</td>
                      <td className="py-3 text-cipher-green">
                        {(day.poolSize / 1000000).toFixed(2)}M {CURRENCY}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          </div>
        )}

        {/* Info Footer */}
        <div className="card bg-cipher-surface/50 border-cipher-border/50">
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
