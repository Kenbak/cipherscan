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

interface RiskStats {
  total: number;
  highRisk: number;
  mediumRisk: number;
}

function formatLargeNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  } else if (num >= 1000) {
    return (num / 1000).toFixed(0) + 'K';
  }
  return num.toString();
}

function MetricCell({
  label,
  tooltip,
  value,
  suffix,
  color = 'purple',
}: {
  label: string;
  tooltip: string;
  value: string | number;
  suffix?: string;
  color?: 'purple' | 'cyan' | 'muted';
}) {
  const colorClass = {
    purple: 'text-purple-400',
    cyan: 'text-cipher-cyan',
    muted: 'text-secondary',
  }[color];

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-[10px] text-muted font-mono uppercase tracking-wide">{label}</span>
        <Tooltip content={tooltip} />
      </div>
      <div className="flex items-baseline gap-1">
        <span className={`text-xl sm:text-2xl lg:text-3xl font-bold font-mono ${colorClass}`}>{value}</span>
        {suffix && <span className="text-[10px] sm:text-xs text-muted font-mono">{suffix}</span>}
      </div>
    </div>
  );
}

export function PrivacyWidget() {
  const [stats, setStats] = useState<PrivacyStats | null>(null);
  const [riskStats, setRiskStats] = useState<RiskStats | null>(null);

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

    const fetchRiskStats = async () => {
      try {
        const apiUrl = usePostgresApiClient()
          ? `${getApiUrl()}/api/privacy/risks?limit=1&period=7d`
          : '/api/privacy/risks?limit=1&period=7d';

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
      }
    };

    fetchStats();
    fetchRiskStats();
  }, []);

  if (!stats || !stats.totals || !stats.metrics) {
    return (
      <div className="card card-interactive">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <span className="text-muted opacity-50">&gt;</span>
            <span className="text-xs text-muted font-mono uppercase tracking-wide">PRIVACY_METRICS</span>
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="animate-pulse">
              <div className="h-3 w-16 skeleton-bg rounded mb-3"></div>
              <div className="h-6 w-20 skeleton-bg rounded"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const totalTxs = stats.totals.totalTx || 0;
  const poolSizeFormatted = ((stats.shieldedPool?.currentSize || 0) / 1000000).toFixed(2);
  const privacyScore = stats.metrics.privacyScore || 0;
  const shieldedPct = (stats.metrics.shieldedPercentage || 0).toFixed(1);
  const hasRisks = riskStats && riskStats.total > 0;
  const hasHighRisk = riskStats && riskStats.highRisk > 0;

  return (
    <div className="card card-interactive group">
      {/* Header */}
      <Link href="/privacy" className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <span className="text-muted opacity-50">&gt;</span>
          <span className="text-xs text-muted font-mono uppercase tracking-wide">PRIVACY_METRICS</span>
        </div>
        <span className="text-xs text-purple-400 font-mono group-hover:text-purple-300 transition-colors">
          View Dashboard &gt;
        </span>
      </Link>

      {/* Metrics grid — responsive: 2-col mobile, 4-col desktop */}
      <Link href="/privacy" className="block">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5 lg:gap-0">
          <div className="lg:border-r lg:border-cipher-border/20 lg:pr-5">
            <MetricCell
              label="Privacy Score"
              tooltip="Overall network privacy health score"
              value={privacyScore}
              suffix="/100"
              color="purple"
            />
          </div>
          <div className="lg:border-r lg:border-cipher-border/20 lg:px-5">
            <MetricCell
              label="Shielded Pool"
              tooltip="Total ZEC currently in the shielded pool"
              value={`${poolSizeFormatted}M`}
              suffix={CURRENCY}
              color="purple"
            />
          </div>
          {/* Divider between rows on mobile only */}
          <div className="col-span-2 border-t border-cipher-border/10 lg:hidden" />
          <div className="lg:border-r lg:border-cipher-border/20 lg:px-5">
            <MetricCell
              label="Shielded TXs"
              tooltip="Percentage of transactions using shielded pools"
              value={shieldedPct}
              suffix="%"
              color="cyan"
            />
          </div>
          <div className="lg:pl-5">
            <MetricCell
              label="Total TXs"
              tooltip="Total transactions indexed"
              value={formatLargeNumber(totalTxs)}
              color="muted"
            />
          </div>
        </div>
      </Link>

      {/* Risk alert footer */}
      {hasRisks && (
        <Link
          href="/privacy-risks?period=7d"
          className="flex items-center justify-between gap-3 mt-5 pt-4 border-t border-cipher-border/20 group/risk"
        >
          <div className="flex items-center gap-2 min-w-0 flex-wrap">
            <svg className={`w-4 h-4 flex-shrink-0 ${hasHighRisk ? 'text-red-400' : 'text-orange-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span className={`text-sm font-bold font-mono ${hasHighRisk ? 'text-red-400' : 'text-orange-400'}`}>
              {riskStats!.total}
            </span>
            <span className="text-xs sm:text-sm text-secondary">
              Privacy Risk{riskStats!.total > 1 ? 's' : ''}
            </span>
            <Badge color={hasHighRisk ? 'orange' : 'muted'}>7D</Badge>
          </div>
          <span className={`text-xs font-mono flex-shrink-0 ${hasHighRisk ? 'text-red-400' : 'text-orange-400'} group-hover/risk:opacity-70 transition-opacity`}>
            View &gt;
          </span>
        </Link>
      )}
    </div>
  );
}
