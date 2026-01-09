'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getApiUrl, usePostgresApiClient } from '@/lib/api-config';
import { AddressDisplay } from '@/components/AddressWithLabel';

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

  // Don't show anything while loading or if no shielded activity
  if (loading || !data || !data.hasShieldedActivity) {
    return null;
  }

  // If no linked transactions found, show a positive "private" message
  if (data.linkedTransactions.length === 0 || data.warningLevel === 'LOW') {
    const amountZec = (data.amount || 0).toFixed(4);
    const flowVerb = data.flowType === 'shield' ? 'shields' : 'unshields';
    const address = data.transparentAddresses?.[0];

    // Success color from design system: #00E676
    return (
      <div
        className="mt-4 rounded-xl border overflow-hidden"
        style={{
          backgroundColor: 'rgba(0, 230, 118, 0.08)',
          borderColor: 'rgba(0, 230, 118, 0.3)',
        }}
      >
        {/* Header */}
        <div
          className="px-4 py-3 flex items-center justify-between"
          style={{ backgroundColor: 'rgba(0, 230, 118, 0.12)' }}
        >
          <div className="flex items-center gap-3">
            <div
              className="p-1.5 rounded-md"
              style={{ backgroundColor: 'rgba(0, 230, 118, 0.15)', color: '#00E676' }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <h3 className="text-sm font-semibold" style={{ color: '#00E676' }}>
              No Round-Trip Detected
            </h3>
          </div>
          <span
            className="px-2 py-1 rounded text-xs font-medium"
            style={{ backgroundColor: 'rgba(0, 230, 118, 0.15)', color: '#00E676' }}
          >
            Private
          </span>
        </div>

        {/* Content */}
        <div className="p-4">
          <p className="text-sm text-secondary">
            This transaction {flowVerb}{' '}
            <span className="text-primary font-medium">{amountZec} ZEC</span>
            {address && (
              <>
                {data.flowType === 'shield' ? ' from ' : ' to '}
                <AddressDisplay address={address} className="text-xs" />
              </>
            )}.
            No matching {data.flowType === 'shield' ? 'unshield' : 'shield'} with a similar amount was found.
          </p>
          <p className="text-xs text-muted italic mt-2">
            This doesn&apos;t guarantee privacy, but no obvious round-trip pattern was detected.
          </p>
        </div>
      </div>
    );
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

  // Use design system colors (from docs/UI-UX/02-COLOR-SYSTEM.md)
  // Error: #EF4444, Warning: #FF6B35

  return (
    <div
      className="mt-4 rounded-xl border overflow-hidden"
      style={{
        backgroundColor: isHigh ? 'rgba(239, 68, 68, 0.08)' : 'rgba(255, 107, 53, 0.08)',
        borderColor: isHigh ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255, 107, 53, 0.2)',
      }}
    >
      {/* Header */}
      <div
        className="px-4 py-3 flex items-center justify-between"
        style={{
          backgroundColor: isHigh ? 'rgba(239, 68, 68, 0.12)' : 'rgba(255, 107, 53, 0.12)',
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="p-1.5 rounded-md"
            style={{
              backgroundColor: isHigh ? 'rgba(239, 68, 68, 0.15)' : 'rgba(255, 107, 53, 0.15)',
              color: isHigh ? '#EF4444' : '#FF6B35',
            }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h3
            className="text-sm font-semibold"
            style={{ color: isHigh ? '#EF4444' : '#FF6B35' }}
          >
            Privacy Alert
          </h3>
        </div>
        <div className="flex items-center gap-3">
          <span
            className="px-2 py-1 rounded text-xs font-medium"
            style={{
              backgroundColor: isHigh ? 'rgba(239, 68, 68, 0.15)' : 'rgba(255, 107, 53, 0.15)',
              color: isHigh ? '#EF4444' : '#FF6B35',
            }}
          >
            {isHigh ? 'High Risk' : 'Medium Risk'}
          </span>
          <div className="flex items-baseline gap-0.5">
            <span
              className="text-xl font-bold font-mono"
              style={{ color: isHigh ? '#EF4444' : '#FF6B35' }}
            >
              {data.highestScore}
            </span>
            <span className="text-xs text-muted">/100</span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {/* Transaction info */}
        <div className="space-y-2">
          <p className="text-sm text-secondary">
            This transaction {isDeshield ? 'unshields' : 'shields'}{' '}
            <span className="text-primary font-medium">{data.amount.toFixed(4)} ZEC</span>
            {currentAddress && (
              <>
                {isDeshield ? ' to ' : ' from '}
                <AddressDisplay address={currentAddress} className="text-xs" />
              </>
            )}
          </p>

          <p className="text-sm text-secondary">
            A similar amount was {isDeshield ? 'shielded' : 'unshielded'}
            {linkedAddress && (
              <>
                {isDeshield ? ' from ' : ' to '}
                <AddressDisplay address={linkedAddress} className="text-xs" />
              </>
            )}
            {timeDelta && <span className="text-muted"> ({timeDelta})</span>}
          </p>
        </div>

        {/* Conclusion */}
        <p className="text-sm text-secondary italic">
          → An observer could conclude that{' '}
          <span className="not-italic">{currentAddress ? <AddressDisplay address={currentAddress} className="text-xs" /> : 'address A'}</span>
          {' '}and{' '}
          <span className="not-italic">{linkedAddress ? <AddressDisplay address={linkedAddress} className="text-xs" /> : 'address B'}</span>
          {' '}belong to the same person.
        </p>

        {/* Linked TX */}
        <div className="flex items-center gap-2 text-xs text-muted">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
          <span>Linked transaction:</span>
          <Link
            href={`/tx/${topMatch.txid}`}
            className="font-mono text-primary hover:text-cipher-cyan transition-colors"
          >
            {truncateTxid(topMatch.txid)}
          </Link>
        </div>

        {/* Why is this a risk */}
        <div
          className="pt-3 border-t"
          style={{ borderColor: isHigh ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255, 107, 53, 0.2)' }}
        >
          <button
            onClick={() => setShowWhy(!showWhy)}
            className="text-xs text-muted hover:text-secondary flex items-center gap-1.5 transition-colors"
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
            <div className="mt-3 text-xs text-secondary leading-relaxed">
              <p>
                When you shield and then unshield similar amounts within a short time,
                an observer can correlate the transactions and link your transparent addresses.
              </p>
              <p className="mt-2 text-muted">
                The only foolproof way to defeat this is to <strong className="text-primary">ZODL</strong> — hold your ZEC in the shielded pool longer.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
