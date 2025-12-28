'use client';

import { useState, useEffect } from 'react';
import { getApiUrl, usePostgresApiClient } from '@/lib/api-config';

interface LinkabilityData {
  success: boolean;
  hasShieldedActivity: boolean;
  warningLevel: 'HIGH' | 'MEDIUM' | 'LOW';
  highestScore: number;
  linkedTransactions: { txid: string }[];
}

interface PrivacyRiskBadgeProps {
  txid: string;
}

/**
 * A simple visual badge indicator for linkability risk.
 * Details are shown in the PrivacyRiskInline component within the summary box.
 */
export function PrivacyRiskBadge({ txid }: PrivacyRiskBadgeProps) {
  const [data, setData] = useState<LinkabilityData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLinkability = async () => {
      try {
        const apiUrl = usePostgresApiClient()
          ? `${getApiUrl()}/api/tx/${txid}/linkability`
          : `/api/tx/${txid}/linkability`;

        const response = await fetch(apiUrl);
        if (!response.ok) return;

        const result = await response.json();
        if (result.success) {
          setData(result);
        }
      } catch (error) {
        console.error('Failed to fetch linkability:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchLinkability();
  }, [txid]);

  // Don't show if loading, no data, no shielded activity, or LOW risk
  if (loading || !data || !data.hasShieldedActivity || data.warningLevel === 'LOW' || data.linkedTransactions.length === 0) {
    return null;
  }

  const isHigh = data.warningLevel === 'HIGH';

  return (
    <span
      className={`px-2 md:px-3 py-1 text-xs md:text-sm rounded font-mono flex items-center gap-1 md:gap-2 ${
        isHigh
          ? 'bg-red-500/10 text-red-600 dark:text-red-400'
          : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
      }`}
      title="This transaction may be linked to another - see details below"
    >
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
      <span className="hidden sm:inline">PRIVACY RISK</span>
      <span className="sm:hidden">⚠️</span>
    </span>
  );
}
