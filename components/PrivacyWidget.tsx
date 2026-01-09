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

// Icons for Privacy Widget - Refined with consistent sizing
const PrivacyIcons = {
  Shield: () => (
    <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  ),
  Lock: () => (
    <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
    </svg>
  ),
  Chart: () => (
    <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  ),
  Database: () => (
    <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
    </svg>
  ),
  ArrowRight: () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
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

interface RiskStats {
  total: number;
  highRisk: number;
  mediumRisk: number;
}

// Metric Card Component for consistency
function MetricCard({
  icon,
  label,
  value,
  suffix,
  subValue,
  color = 'purple',
  showBorder = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  suffix?: string;
  subValue?: string;
  color?: 'purple' | 'cyan' | 'default';
  showBorder?: boolean;
}) {
  const colorClasses = {
    purple: 'text-purple-400',
    cyan: 'text-cipher-cyan',
    default: 'text-secondary',
  };

  const iconBgClasses = {
    purple: 'bg-purple-500/10',
    cyan: 'bg-cipher-cyan/10',
    default: 'bg-gray-500/10',
  };

  return (
    <div className={`flex items-center gap-3 sm:gap-4 ${showBorder ? 'lg:border-l lg:border-cipher-border/50 lg:pl-6' : ''}`}>
      <div className={`hidden sm:flex p-2.5 rounded-xl ${iconBgClasses[color]}`}>
        <span className={colorClasses[color]}>{icon}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-1">
          <span className="text-[10px] sm:text-xs text-muted font-mono uppercase tracking-wide">{label}</span>
          <Tooltip content={`Information about ${label.toLowerCase()}`} />
        </div>
        <div className="flex items-baseline gap-1">
          <span className={`text-lg sm:text-2xl lg:text-3xl font-bold font-mono ${colorClasses[color]}`}>
            {value}
          </span>
          {suffix && <span className="text-xs sm:text-sm text-muted">{suffix}</span>}
        </div>
        {subValue && <span className="text-[10px] sm:text-xs text-muted">{subValue}</span>}
      </div>
    </div>
  );
}

export function PrivacyWidget() {
  const [stats, setStats] = useState<PrivacyStats | null>(null);
  const [priceData, setPriceData] = useState<PriceData | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const apiUrl = usePostgresApiClient()
          ? `${getApiUrl()}/api/privacy-stats`
          : '/api/privacy-stats';

        const response = await fetch(apiUrl);
        const result = await response.json();
        const statsData = result.success ? result.data : result;
        setStats(statsData);
      } catch (error) {
        console.error('Error fetching privacy stats:', error);
      }
    };

    const fetchPrice = async () => {
      try {
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

  // Loading state with skeleton
  if (!stats || !stats.totals || !stats.metrics) {
    return (
      <div className="card-base card-featured">
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs text-muted font-mono uppercase tracking-wide">ZCASH PRIVACY METRICS</span>
          <span className="text-xs text-cipher-cyan font-mono">View Dashboard →</span>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="animate-pulse">
              <div className="h-3 w-20 skeleton-bg rounded mb-2"></div>
              <div className="h-8 w-24 skeleton-bg rounded"></div>
            </div>
          ))}
        </div>
        <div className="mt-4 pt-4 border-t border-cipher-border/30 text-center">
          <p className="text-sm text-muted font-mono flex items-center justify-center gap-2">
            <span className="inline-block animate-pulse">⏳</span>
            Indexing blockchain data...
          </p>
        </div>
      </div>
    );
  }

  const totalTxs = stats.totals.totalTx || 0;
  const poolSizeFormatted = ((stats.shieldedPool?.currentSize || 0) / 1000000).toFixed(2);
  const poolValueUsd = priceData && stats.shieldedPool?.currentSize
    ? `$${((stats.shieldedPool.currentSize * priceData.price) / 1000000).toFixed(2)}M USD`
    : undefined;

  return (
    <Link href="/privacy" className="block group">
      <div className="card-base card-featured group-hover:border-purple-500/40 transition-all duration-300">
        {/* Header */}
        <div className="flex items-center justify-between mb-4 sm:mb-6">
          <span className="text-[10px] sm:text-xs text-muted font-mono uppercase tracking-wide">
            🛡️ ZCASH PRIVACY METRICS
          </span>
          <div className="flex items-center gap-1.5 text-purple-400 group-hover:text-purple-300 transition-colors">
            <span className="text-xs sm:text-sm font-mono">View Dashboard</span>
            <PrivacyIcons.ArrowRight />
          </div>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 lg:gap-0">
          <MetricCard
            icon={<PrivacyIcons.Shield />}
            label="Privacy Score"
            value={stats.metrics.privacyScore || 0}
            suffix="/100"
            color="purple"
          />
          <MetricCard
            icon={<PrivacyIcons.Lock />}
            label="Shielded Pool"
            value={`${poolSizeFormatted}M`}
            suffix={CURRENCY}
            subValue={poolValueUsd}
            color="purple"
            showBorder
          />
          <MetricCard
            icon={<PrivacyIcons.Chart />}
            label="Shielded TXs"
            value={(stats.metrics.shieldedPercentage || 0).toFixed(1)}
            suffix="%"
            color="cyan"
            showBorder
          />
          <MetricCard
            icon={<PrivacyIcons.Database />}
            label="Total TXs"
            value={formatLargeNumber(totalTxs)}
            color="default"
            showBorder
          />
        </div>
      </div>
    </Link>
  );
}

// Separate compact widget for Privacy Risks
export function PrivacyRisksWidget() {
  const [riskStats, setRiskStats] = useState<RiskStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRiskStats = async () => {
      try {
        const apiUrl = usePostgresApiClient()
          ? `${getApiUrl()}/api/privacy/risks?limit=1&period=24h`
          : '/api/privacy/risks?limit=1&period=24h';

        const response = await fetch(apiUrl);
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.stats) {
            setRiskStats({
              total: data.stats.total,
              highRisk: data.stats.highRisk,
              mediumRisk: data.stats.mediumRisk,
            });
          }
        }
      } catch (error) {
        console.error('Error fetching risk stats:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchRiskStats();
  }, []);

  // Don't show if no risks or still loading
  if (loading || !riskStats || riskStats.total === 0) {
    return null;
  }

  const hasHighRisk = riskStats.highRisk > 0;
  const accentColor = hasHighRisk ? 'text-red-400' : 'text-purple-400';
  const bgColor = hasHighRisk ? 'bg-red-500/10' : 'bg-purple-500/10';
  const borderHover = hasHighRisk ? 'group-hover:border-red-500/40' : 'group-hover:border-purple-500/40';

  return (
    <Link href="/privacy-risks?period=24h" className="block group">
      <div className={`card-base card-compact ${borderHover} transition-all duration-300`}>
        <div className="flex items-center justify-between gap-3">
          {/* Left: Icon + Text */}
          <div className="flex items-center gap-3 min-w-0">
            <div className={`p-2 rounded-lg shrink-0 ${bgColor}`}>
              <svg className={`w-4 h-4 sm:w-5 sm:h-5 ${accentColor}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div className="flex items-baseline gap-2 flex-wrap min-w-0">
              <span className={`text-lg sm:text-xl font-bold font-mono ${accentColor}`}>
                {riskStats.total}
              </span>
              <span className="text-sm text-primary">
                Privacy Risk{riskStats.total > 1 ? 's' : ''}
              </span>
              <span className="text-xs text-muted hidden sm:inline">
                detected in the last 24h
              </span>
            </div>
          </div>

          {/* Right: Arrow */}
          <div className={`flex items-center gap-1.5 shrink-0 ${accentColor} group-hover:translate-x-0.5 transition-transform`}>
            <span className="text-xs sm:text-sm font-mono">View</span>
            <PrivacyIcons.ArrowRight />
          </div>
        </div>
      </div>
    </Link>
  );
}
