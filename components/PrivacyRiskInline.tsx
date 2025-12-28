'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getApiUrl, usePostgresApiClient } from '@/lib/api-config';

interface LinkedTransaction {
  txid: string;
  flowType: 'shield' | 'deshield';
  amount: number;
  timeDelta: string;
  linkabilityScore: number;
  transparentAddresses?: string[];
}

interface LinkabilityData {
  success: boolean;
  txid: string;
  flowType: 'shield' | 'deshield' | null;
  amount: number;
  hasShieldedActivity: boolean;
  warningLevel: 'HIGH' | 'MEDIUM' | 'LOW';
  highestScore: number;
  linkedTransactions: LinkedTransaction[];
  transparentAddresses?: string[];
}

interface PrivacyRiskInlineProps {
  txid: string;
}

function truncateTxid(txid: string): string {
  return `${txid.slice(0, 8)}...${txid.slice(-6)}`;
}

function truncateAddress(address: string): string {
  if (address.length <= 14) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function PrivacyRiskInline({ txid }: PrivacyRiskInlineProps) {
  const [data, setData] = useState<LinkabilityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showWhy, setShowWhy] = useState(false);

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

  // Don't show anything while loading or if no risk
  if (loading || !data || !data.hasShieldedActivity || data.warningLevel === 'LOW' || data.linkedTransactions.length === 0) {
    return null;
  }

  const topMatch = data.linkedTransactions[0];
  const linkedAddress = topMatch?.transparentAddresses?.[0];
  const currentAddress = data.transparentAddresses?.[0];
  const isDeshield = data.flowType === 'deshield';
  const isHigh = data.warningLevel === 'HIGH';

  // Convert "after" to "later" and clean up pluralization
  const timeDelta = topMatch?.timeDelta
    ?.replace(' after', ' later')
    ?.replace('1 minutes', '1 minute')
    ?.replace('1 hours', '1 hour')
    ?.replace('1 days', '1 day') || '';

  return (
    <div className={`mt-4 rounded-xl overflow-hidden border ${
      isHigh
        ? 'border-red-300 dark:border-red-500/30 bg-red-50 dark:bg-red-500/5'
        : 'border-amber-300 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/5'
    }`}>
      {/* Header */}
      <div className={`px-4 py-3 flex items-center justify-between ${
        isHigh ? 'bg-red-100 dark:bg-red-500/10' : 'bg-amber-100 dark:bg-amber-500/10'
      }`}>
        <div className="flex items-center gap-3">
          <div className={`p-1.5 rounded-lg ${isHigh ? 'bg-red-200 dark:bg-red-500/20' : 'bg-amber-200 dark:bg-amber-500/20'}`}>
            <svg
              className={`w-4 h-4 ${isHigh ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h3 className={`text-sm font-semibold ${isHigh ? 'text-red-700 dark:text-red-400' : 'text-amber-700 dark:text-amber-400'}`}>
            Privacy Alert
          </h3>
        </div>
        <div className="flex items-center gap-3">
          <span className={`px-2 py-1 rounded-md text-xs font-medium ${
            isHigh
              ? 'bg-red-200 dark:bg-red-500/20 text-red-700 dark:text-red-400'
              : 'bg-amber-200 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400'
          }`}>
            {isHigh ? 'High Risk' : 'Medium Risk'}
          </span>
          <div className="flex items-baseline gap-0.5">
            <span className={`text-xl font-bold font-mono ${isHigh ? 'text-red-700 dark:text-red-400' : 'text-amber-700 dark:text-amber-400'}`}>
              {data.highestScore}
            </span>
            <span className="text-xs text-gray-500 dark:text-muted">/100</span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 py-4 space-y-4">
        {/* Transaction info */}
        <div className="space-y-2">
          <p className="text-sm text-gray-700 dark:text-secondary">
            This transaction {isDeshield ? 'unshields' : 'shields'}{' '}
            <span className="text-gray-900 dark:text-primary font-medium">{data.amount.toFixed(4)} ZEC</span>
            {currentAddress && (
              <>
                {isDeshield ? ' to ' : ' from '}
                <Link href={`/address/${currentAddress}`} className="text-gray-900 dark:text-primary font-mono hover:underline">
                  {truncateAddress(currentAddress)}
                </Link>
              </>
            )}
          </p>

          <p className="text-sm text-gray-700 dark:text-secondary">
            A similar amount was {isDeshield ? 'shielded' : 'unshielded'}
            {linkedAddress && (
              <>
                {isDeshield ? ' from ' : ' to '}
                <Link href={`/address/${linkedAddress}`} className="text-gray-900 dark:text-primary font-mono hover:underline">
                  {truncateAddress(linkedAddress)}
                </Link>
              </>
            )}
            {timeDelta && <span className="text-gray-500 dark:text-muted"> ({timeDelta})</span>}
          </p>
        </div>

        {/* Conclusion */}
        <p className="text-sm text-gray-700 dark:text-secondary italic">
          → An observer could conclude that{' '}
          <span className="font-mono text-gray-900 dark:text-primary not-italic">{currentAddress ? truncateAddress(currentAddress) : 'address A'}</span>
          {' '}and{' '}
          <span className="font-mono text-gray-900 dark:text-primary not-italic">{linkedAddress ? truncateAddress(linkedAddress) : 'address B'}</span>
          {' '}belong to the same person.
        </p>

        {/* Linked TX */}
        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-muted">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
          <span>Linked transaction:</span>
          <Link
            href={`/tx/${topMatch.txid}`}
            className="font-mono text-gray-900 dark:text-primary hover:underline"
          >
            {truncateTxid(topMatch.txid)}
          </Link>
        </div>

        {/* Why is this a risk */}
        <div className={`pt-3 border-t ${isHigh ? 'border-red-200 dark:border-red-500/20' : 'border-amber-200 dark:border-amber-500/20'}`}>
          <button
            onClick={() => setShowWhy(!showWhy)}
            className="text-xs text-gray-500 dark:text-muted hover:text-gray-700 dark:hover:text-secondary flex items-center gap-1.5 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Why is this a risk?
            <svg className={`w-3 h-3 transition-transform ${showWhy ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showWhy && (
            <div className="mt-3 text-xs text-gray-600 dark:text-secondary leading-relaxed">
              <p>
                When you shield and then unshield similar amounts within a short time,
                an observer can correlate the transactions and link your transparent addresses.
              </p>
              <p className="mt-2 text-gray-500 dark:text-muted">
                The only foolproof way to defeat this is to <strong className="text-gray-900 dark:text-primary">ZODL</strong> — hold your ZEC in the shielded pool longer.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
