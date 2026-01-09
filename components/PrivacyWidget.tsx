'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Tooltip } from '@/components/Tooltip';
import { CURRENCY } from '@/lib/config';
import { usePostgresApiClient, getApiUrl } from '@/lib/api-config';
import { Badge } from '@/components/ui/Badge';

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

// Icons - consistent w-4 h-4 size like other homepage components
const Icons = {
  Shield: ({ className = "w-4 h-4" }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  ),
  Lock: ({ className = "w-4 h-4" }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
    </svg>
  ),
  Chart: ({ className = "w-4 h-4" }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  ),
  Database: ({ className = "w-4 h-4" }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

interface RiskStats {
  total: number;
  highRisk: number;
  mediumRisk: number;
}

// Metric Item - simplified, consistent with design system
function MetricItem({
  icon,
  label,
  value,
  suffix,
  color = 'purple',
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  suffix?: string;
  color?: 'purple' | 'cyan' | 'muted';
}) {
  const colorClasses = {
    purple: 'text-purple-400',
    cyan: 'text-cipher-cyan',
    muted: 'text-secondary',
  };

  const iconBgClasses = {
    purple: 'bg-purple-500/10',
    cyan: 'bg-cipher-cyan/10',
    muted: 'bg-cipher-surface',
  };

  return (
    <div className="flex items-center gap-3">
      <span className={`w-6 h-6 flex items-center justify-center rounded-md ${iconBgClasses[color]}`}>
        <span className={colorClasses[color]}>{icon}</span>
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted font-mono uppercase tracking-wide">{label}</span>
          <Tooltip content={`Information about ${label.toLowerCase()}`} />
        </div>
        <div className="flex items-baseline gap-1">
          <span className={`text-xl sm:text-2xl font-bold font-mono ${colorClasses[color]}`}>
            {value}
          </span>
          {suffix && <span className="text-xs text-muted">{suffix}</span>}
        </div>
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
      <div className="card card-interactive">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="text-purple-400">&gt;</span>
            <span className="text-xs text-muted font-mono uppercase tracking-wide">PRIVACY_METRICS</span>
          </div>
          <Badge color="purple">LOADING</Badge>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="animate-pulse">
              <div className="h-3 w-16 skeleton-bg rounded mb-2"></div>
              <div className="h-6 w-20 skeleton-bg rounded"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const totalTxs = stats.totals.totalTx || 0;
  const poolSizeFormatted = ((stats.shieldedPool?.currentSize || 0) / 1000000).toFixed(2);

  return (
    <Link href="/privacy" className="block group">
      <div className="card card-interactive">
        {/* Header - consistent with RecentBlocks/ShieldedTxs */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="text-purple-400">&gt;</span>
            <span className="text-xs text-muted font-mono uppercase tracking-wide">PRIVACY_METRICS</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-purple-400 font-mono group-hover:text-purple-300 transition-colors">
              View Dashboard &gt;
            </span>
          </div>
        </div>

        {/* Metrics Grid - 4 columns with separators */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-0 lg:divide-x lg:divide-cipher-border/30">
          <div className="lg:pr-4">
            <MetricItem
              icon={<Icons.Shield />}
              label="Privacy Score"
              value={stats.metrics.privacyScore || 0}
              suffix="/100"
              color="purple"
            />
          </div>
          <div className="lg:px-4">
            <MetricItem
              icon={<Icons.Lock />}
              label="Shielded Pool"
              value={`${poolSizeFormatted}M`}
              suffix={CURRENCY}
              color="purple"
            />
          </div>
          <div className="lg:px-4">
            <MetricItem
              icon={<Icons.Chart />}
              label="Shielded TXs"
              value={(stats.metrics.shieldedPercentage || 0).toFixed(1)}
              suffix="%"
              color="cyan"
            />
          </div>
          <div className="lg:pl-4">
            <MetricItem
              icon={<Icons.Database />}
              label="Total TXs"
              value={formatLargeNumber(totalTxs)}
              color="muted"
            />
          </div>
        </div>
      </div>
    </Link>
  );
}

// Separate compact widget for Privacy Risks - consistent design
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

  return (
    <Link href="/privacy-risks?period=7d" className="block group">
      <div className="card card-compact card-interactive">
        <div className="flex items-center justify-between gap-3">
          {/* Left: Icon + Text */}
          <div className="flex items-center gap-3 min-w-0">
            <span className={`w-6 h-6 flex items-center justify-center rounded-md ${hasHighRisk ? 'bg-red-500/10' : 'bg-orange-500/10'}`}>
              <svg className={`w-4 h-4 ${hasHighRisk ? 'text-red-400' : 'text-orange-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </span>
            <div className="flex items-center gap-2 flex-wrap min-w-0">
              <span className={`text-lg font-bold font-mono ${hasHighRisk ? 'text-red-400' : 'text-orange-400'}`}>
                {riskStats.total}
              </span>
              <span className="text-sm text-primary">
                Privacy Risk{riskStats.total > 1 ? 's' : ''}
              </span>
              <Badge color={hasHighRisk ? 'orange' : 'muted'}>7D</Badge>
            </div>
          </div>

          {/* Right: View link */}
          <span className={`text-xs font-mono ${hasHighRisk ? 'text-red-400' : 'text-orange-400'} group-hover:opacity-80 transition-opacity`}>
            View &gt;
          </span>
        </div>
      </div>
    </Link>
  );
}
