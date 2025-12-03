'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Tooltip } from '@/components/Tooltip';
import { CURRENCY } from '@/lib/config';
import { usePostgresApiClient, getApiUrl } from '@/lib/api-config';

interface PrivacyStats {
  metrics: {
    shieldedPercentage: number;
    privacyScore: number;
    avgShieldedPerDay: number;
    adoptionTrend: string;
  };
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
  trends: {
    daily: Array<{
      date: string;
      shielded: number;
      transparent: number;
      shieldedPercentage: number;
      poolSize: number;
    }>;
  };
  lastUpdated: string;
  lastBlockScanned: number;
}

interface PriceData {
  price: number;
  change24h: number;
}

// Icons for Privacy Widget
const PrivacyIcons = {
  Shield: () => (
    <svg className="w-6 h-6 sm:w-7 sm:h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  ),
  Lock: () => (
    <svg className="w-6 h-6 sm:w-7 sm:h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
    </svg>
  ),
  Chart: () => (
    <svg className="w-6 h-6 sm:w-7 sm:h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  ),
  Database: () => (
    <svg className="w-6 h-6 sm:w-7 sm:h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
    </svg>
  ),
};

// Helper function to format large numbers
function formatLargeNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  } else if (num >= 1000) {
    return (num / 1000).toFixed(0) + 'K';
  }
  return num.toString();
}

export function PrivacyWidget() {
  const [stats, setStats] = useState<PrivacyStats | null>(null);
  const [priceData, setPriceData] = useState<PriceData | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        // For testnet, call Express API directly; for mainnet, use Next.js API
        const apiUrl = usePostgresApiClient()
          ? `${getApiUrl()}/api/privacy-stats`
          : '/api/privacy-stats';

        const response = await fetch(apiUrl);
        const result = await response.json();

        // Handle both direct Express API response and Next.js wrapper
        const statsData = result.success ? result.data : result;
        setStats(statsData);
      } catch (error) {
        console.error('Error fetching privacy stats:', error);
      }
    };

    const fetchPrice = async () => {
      try {
        // Call CoinGecko directly (no need for proxy API)
        const response = await fetch(
          'https://api.coingecko.com/api/v3/simple/price?ids=zcash&vs_currencies=usd&include_24hr_change=true'
        );
        if (response.ok) {
          const data = await response.json();
          setPriceData({
            price: data.zcash.usd,
            change24h: data.zcash.usd_24h_change,
          });
        }
      } catch (error) {
        console.error('Error fetching price:', error);
      }
    };

    fetchStats();
    fetchPrice();
  }, []);

  // Loading state or data not available yet
  if (!stats || !stats.totals || !stats.metrics) {
    return (
      <div className="mb-12 sm:mb-16">
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs text-gray-500 font-mono">ZCASH PRIVACY METRICS</span>
          <Link
            href="/privacy"
            className="text-xs text-cipher-cyan hover:text-cipher-green transition-colors font-mono"
          >
            View Dashboard →
          </Link>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="card !p-4 animate-pulse">
              <div className="h-6 bg-cipher-border rounded mb-2"></div>
              <div className="h-8 bg-cipher-border rounded"></div>
            </div>
          ))}
        </div>
        {/* Indexing message for mainnet */}
        <div className="mt-4 text-center">
          <p className="text-sm text-gray-500 font-mono">
            <span className="inline-block animate-pulse mr-2">⏳</span>
            Indexing blockchain data...
          </p>
        </div>
      </div>
    );
  }

  const totalTxs = stats.totals.totalTx || 0;

  return (
    <Link href="/privacy" className="block group">
      <div className="card hover:border-purple-500/50 !p-4 sm:!p-6">
        {/* Grid layout like Etherscan - 2 cols on mobile, 4 on desktop */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6">

          {/* Privacy Score */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3 lg:gap-4">
            <div className="text-purple-400 hidden sm:block">
              <PrivacyIcons.Shield />
            </div>
            <div className="flex-1 w-full">
              <div className="flex items-center gap-1 mb-1">
                <div className="text-xs text-gray-500">PRIVACY SCORE</div>
                <Tooltip content="Overall privacy health of the blockchain (0-100). Based on shielded adoption, pool size, and usage trends." />
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-xl sm:text-2xl lg:text-3xl font-bold text-purple-400">
                  {stats.metrics.privacyScore || 0}
                </span>
                <span className="text-xs sm:text-sm text-gray-500">/100</span>
              </div>
            </div>
          </div>

          {/* Shielded Pool */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3 lg:gap-4 lg:border-l lg:border-cipher-border lg:pl-6">
            <div className="text-purple-400 hidden sm:block">
              <PrivacyIcons.Lock />
            </div>
            <div className="flex-1 w-full">
              <div className="flex items-center gap-1 mb-1">
                <div className="text-xs text-gray-500">SHIELDED POOL</div>
                <Tooltip content="Total ZEC stored in shielded pools (Sapling + Orchard). These funds are completely private." />
              </div>
              <div className="flex flex-col">
                <span className="text-lg sm:text-xl lg:text-2xl font-bold text-purple-400">
                  {((stats.shieldedPool?.currentSize || 0) / 1000000).toFixed(2)}M {CURRENCY}
                </span>
                {priceData && stats.shieldedPool?.currentSize && (
                  <span className="text-xs text-gray-500">
                    ${((stats.shieldedPool.currentSize * priceData.price) / 1000000).toFixed(2)}M USD
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Shielded Txs Percentage */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3 lg:gap-4 lg:border-l lg:border-cipher-border lg:pl-6">
            <div className="text-cipher-cyan hidden sm:block">
              <PrivacyIcons.Chart />
            </div>
            <div className="flex-1 w-full">
              <div className="flex items-center gap-1 mb-1">
                <div className="text-xs text-gray-500">SHIELDED TXS</div>
                <Tooltip content="Percentage of transactions using at least one shielded input or output. Higher = better privacy adoption." />
              </div>
              <div className="text-xl sm:text-2xl lg:text-3xl font-bold text-cipher-cyan">
                {(stats.metrics.shieldedPercentage || 0).toFixed(1)}%
              </div>
            </div>
          </div>

          {/* Total Transactions */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3 lg:gap-4 lg:border-l lg:border-cipher-border lg:pl-6">
            <div className="text-gray-400 hidden sm:block">
              <PrivacyIcons.Database />
            </div>
            <div className="flex-1 w-full">
              <div className="flex items-center gap-1 mb-1">
                <div className="text-xs text-gray-500">TOTAL TXS</div>
                <Tooltip content="Total number of transactions on the Zcash testnet blockchain (shielded + transparent)." />
              </div>
              <div className="text-xl sm:text-2xl lg:text-3xl font-bold text-white">
                {formatLargeNumber(totalTxs)}
              </div>
            </div>
          </div>

        </div>

        {/* View Dashboard link */}
        <div className="mt-4 pt-4 border-t border-cipher-border flex items-center justify-between">
          <span className="text-xs text-gray-500 font-mono">ZCASH PRIVACY METRICS</span>
          <div className="flex items-center gap-2 text-purple-400 group-hover:text-purple-300 transition-colors">
            <span className="text-sm font-mono">View Dashboard</span>
            <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </div>
      </div>
    </Link>
  );
}
