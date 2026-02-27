'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Tooltip } from '@/components/Tooltip';
import { CURRENCY } from '@/lib/config';
import { usePostgresApiClient, getApiUrl } from '@/lib/api-config';
import { Badge } from '@/components/ui/Badge';

export interface PrivacyStats {
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

export interface RiskStats {
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
    purple: 'text-primary',
    cyan: 'text-primary',
    muted: 'text-primary',
  }[color];

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-[10px] text-muted font-mono uppercase tracking-wide">{label}</span>
        <Tooltip content={tooltip} />
      </div>
      <div className="flex items-baseline gap-1">
        <span className={`text-lg sm:text-xl font-semibold font-mono ${colorClass}`}>{value}</span>
        {suffix && <span className="text-[10px] text-muted font-mono">{suffix}</span>}
      </div>
    </div>
  );
}

interface PrivacyWidgetProps {
  initialStats?: PrivacyStats | null;
  initialRiskStats?: RiskStats | null;
}

export function PrivacyWidget({ initialStats = null, initialRiskStats = null }: PrivacyWidgetProps) {
  const [stats, setStats] = useState<PrivacyStats | null>(initialStats);
  const [riskStats, setRiskStats] = useState<RiskStats | null>(initialRiskStats);

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

    if (!initialStats) fetchStats();
    if (!initialRiskStats) fetchRiskStats();

    const interval = setInterval(() => {
      fetchStats();
      fetchRiskStats();
    }, 60000);
    return () => clearInterval(interval);
  }, [initialStats, initialRiskStats]);

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
    <div className="card card-compact card-interactive group">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-muted opacity-50">&gt;</span>
        <span className="text-xs text-muted font-mono uppercase tracking-wide">PRIVACY_METRICS</span>
      </div>

      {/* Metrics row — all columns share the same visual rhythm */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 sm:gap-5 lg:gap-0">
        <Link href="/privacy" className="lg:border-r lg:border-cipher-border lg:pr-5">
          <MetricCell
            label="Privacy Score"
            tooltip="Overall network privacy health score"
            value={privacyScore}
            suffix="/100"
            color="muted"
          />
        </Link>
        <Link href="/privacy" className="lg:border-r lg:border-cipher-border lg:px-5">
          <MetricCell
            label="Shielded Pool"
            tooltip="Total ZEC currently in the shielded pool"
            value={`${poolSizeFormatted}M`}
            suffix={CURRENCY}
            color="muted"
          />
        </Link>
        {/* Divider between rows on mobile only */}
        <div className="col-span-2 border-t border-cipher-border lg:hidden" />
        <Link href="/privacy" className="lg:border-r lg:border-cipher-border lg:px-5">
          <MetricCell
            label="Shielded TXs"
            tooltip="Percentage of transactions using shielded pools"
            value={shieldedPct}
            suffix="%"
            color="muted"
          />
        </Link>
        <Link href="/privacy" className={`${hasRisks ? 'lg:border-r lg:border-cipher-border' : ''} lg:px-5`}>
          <MetricCell
            label="Total TXs"
            tooltip="Total transactions indexed"
            value={formatLargeNumber(totalTxs)}
            color="muted"
          />
        </Link>

        {/* Risk column — same cell pattern everywhere */}
        {hasRisks && (
          <>
            <div className="col-span-2 border-t border-cipher-border lg:hidden" />
            <Link
              href="/privacy-risks?period=7d"
              className="lg:pl-5 group/risk"
            >
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-[10px] text-muted font-mono uppercase tracking-wide">Privacy Risks</span>
                <Tooltip content="Transactions where shielding patterns may reveal address links" />
              </div>
              <div className="flex items-baseline gap-1">
                <span className={`text-lg sm:text-xl font-semibold font-mono ${hasHighRisk ? 'text-red-400' : 'text-cipher-orange'}`}>
                  {riskStats!.total}
                </span>
                <span className="text-[10px] text-muted font-mono">7d</span>
              </div>
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
