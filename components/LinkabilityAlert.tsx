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
  warningLevel: 'HIGH' | 'MEDIUM' | 'LOW';
  transparentAddresses?: string[];
  scoreBreakdown: {
    amountSimilarity: number;
    timeProximity: number;
    amountRarity: number;
  };
}

interface PrivacyRiskExplanation {
  risk: string;
  description: string;
  yourAddress: string[];
  potentialSourceAddresses?: string[];
  potentialLinkedAddresses?: string[];
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
  totalMatches: number;
  transparentAddresses?: string[];
  privacyRiskExplanation?: PrivacyRiskExplanation;
  educationalNote: string | null;
  algorithm: {
    version: string;
    toleranceZec: number;
    maxTimeWindowDays: number;
    note: string;
  };
}

interface LinkabilityAlertProps {
  txid: string;
}

// Truncate address for display
function truncateAddress(address: string): string {
  if (address.length <= 16) return address;
  return `${address.slice(0, 8)}...${address.slice(-6)}`;
}

// Icons
const Icons = {
  Warning: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  ),
  Link: () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
    </svg>
  ),
  Info: () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  ChevronDown: () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  ),
  ChevronUp: () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
    </svg>
  ),
  Eye: () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  ),
  ArrowRight: () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
    </svg>
  ),
};

export function LinkabilityAlert({ txid }: LinkabilityAlertProps) {
  const [data, setData] = useState<LinkabilityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [showAlgorithm, setShowAlgorithm] = useState(false);

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

  // Only show if there are linked transactions with at least MEDIUM warning
  if (data.linkedTransactions.length === 0 || data.warningLevel === 'LOW') {
    return null;
  }

  const isHighWarning = data.warningLevel === 'HIGH';
  const topMatch = data.linkedTransactions[0];

  // Get addresses for display
  const currentAddress = data.transparentAddresses?.[0];
  const linkedAddress = topMatch?.transparentAddresses?.[0];

  // Determine what the risk is based on flow type
  const isDeshield = data.flowType === 'deshield';

  return (
    <div className={`rounded-lg border ${
      isHighWarning
        ? 'bg-red-500/5 dark:bg-red-500/10 border-red-500/30'
        : 'bg-amber-500/5 dark:bg-amber-500/10 border-amber-500/30'
    } p-4 mt-4 mb-6`}>
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-full flex-shrink-0 ${
          isHighWarning
            ? 'bg-red-500/20 text-red-600 dark:text-red-400'
            : 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
        }`}>
          <Icons.Warning />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className={`font-semibold ${
              isHighWarning
                ? 'text-red-600 dark:text-red-400'
                : 'text-amber-600 dark:text-amber-400'
            }`}>
              Privacy Alert
            </h3>
            <span className={`px-2 py-0.5 text-xs font-mono rounded ${
              isHighWarning
                ? 'bg-red-500/20 text-red-600 dark:text-red-400'
                : 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
            }`}>
              {data.warningLevel} RISK
            </span>
            <span className="text-xs text-muted">
              Score: {data.highestScore}/100
            </span>
          </div>

          {/* Main risk explanation */}
          <div className="mt-3 p-3 rounded-lg bg-cipher-bg/50 dark:bg-cipher-surface/30 border border-cipher-border/50">
            <div className="flex items-start gap-2 text-sm">
              <Icons.Eye />
              <div className="space-y-2">
                {isDeshield ? (
                  <>
                    <p className="text-secondary">
                      <strong className="text-primary">What an observer sees:</strong> This transaction unshields{' '}
                      <span className="font-mono text-cipher-cyan">{data.amount.toFixed(4)} ZEC</span>
                      {currentAddress && (
                        <>
                          {' '}to address{' '}
                          <Link href={`/address/${currentAddress}`} className="font-mono text-cipher-cyan hover:underline">
                            {truncateAddress(currentAddress)}
                          </Link>
                        </>
                      )}
                    </p>
                    {topMatch && (
                      <p className="text-secondary">
                        <strong className="text-primary">Potential link:</strong> A similar amount{' '}
                        <span className="font-mono">({topMatch.amount.toFixed(4)} ZEC)</span> was shielded{' '}
                        {linkedAddress && (
                          <>
                            from{' '}
                            <Link href={`/address/${linkedAddress}`} className="font-mono text-cipher-cyan hover:underline">
                              {truncateAddress(linkedAddress)}
                            </Link>
                          </>
                        )}{' '}
                        <span className="text-muted">{topMatch.timeDelta}</span>
                      </p>
                    )}
                    {currentAddress && linkedAddress && (
                      <p className={`font-medium ${isHighWarning ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'}`}>
                        ⚠️ An observer could conclude that{' '}
                        <span className="font-mono">{truncateAddress(currentAddress)}</span> and{' '}
                        <span className="font-mono">{truncateAddress(linkedAddress)}</span> belong to the same person.
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <p className="text-secondary">
                      <strong className="text-primary">What an observer sees:</strong> This transaction shields{' '}
                      <span className="font-mono text-cipher-cyan">{data.amount.toFixed(4)} ZEC</span>
                      {currentAddress && (
                        <>
                          {' '}from address{' '}
                          <Link href={`/address/${currentAddress}`} className="font-mono text-cipher-cyan hover:underline">
                            {truncateAddress(currentAddress)}
                          </Link>
                        </>
                      )}
                    </p>
                    {topMatch && (
                      <p className="text-secondary">
                        <strong className="text-primary">Potential link:</strong> A similar amount{' '}
                        <span className="font-mono">({topMatch.amount.toFixed(4)} ZEC)</span> was later unshielded{' '}
                        {linkedAddress && (
                          <>
                            to{' '}
                            <Link href={`/address/${linkedAddress}`} className="font-mono text-cipher-cyan hover:underline">
                              {truncateAddress(linkedAddress)}
                            </Link>
                          </>
                        )}{' '}
                        <span className="text-muted">{topMatch.timeDelta}</span>
                      </p>
                    )}
                    {currentAddress && linkedAddress && (
                      <p className={`font-medium ${isHighWarning ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'}`}>
                        ⚠️ An observer could conclude that{' '}
                        <span className="font-mono">{truncateAddress(currentAddress)}</span> and{' '}
                        <span className="font-mono">{truncateAddress(linkedAddress)}</span> belong to the same person.
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Linked transaction link */}
          {topMatch && (
            <div className="mt-3 flex items-center gap-2 text-xs">
              <Icons.Link />
              <span className="text-muted">Linked TX:</span>
              <Link
                href={`/tx/${topMatch.txid}`}
                className="text-cipher-cyan hover:underline font-mono"
              >
                {topMatch.txid.slice(0, 12)}...{topMatch.txid.slice(-8)}
              </Link>
              <span className={`px-2 py-0.5 rounded ${
                topMatch.flowType === 'shield'
                  ? 'bg-green-500/20 text-green-600 dark:text-green-400'
                  : 'bg-purple-500/20 text-purple-600 dark:text-purple-400'
              }`}>
                {topMatch.flowType === 'shield' ? '↓ Shield' : '↑ Unshield'}
              </span>
            </div>
          )}

          {/* Expand to see more potential links */}
          {data.linkedTransactions.length > 1 && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="mt-3 flex items-center gap-1 text-xs text-muted hover:text-secondary transition-colors"
            >
              {expanded ? <Icons.ChevronUp /> : <Icons.ChevronDown />}
              {expanded ? 'Hide other candidates' : `${data.linkedTransactions.length - 1} other potential source${data.linkedTransactions.length > 2 ? 's' : ''}`}
            </button>
          )}

          {/* Expanded list */}
          {expanded && (
            <div className="mt-3 space-y-2">
              {data.linkedTransactions.slice(1).map((tx) => (
                <div
                  key={tx.txid}
                  className="p-2 rounded bg-cipher-bg/30 dark:bg-cipher-surface/20 border border-cipher-border/30"
                >
                  <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/tx/${tx.txid}`}
                        className="text-cipher-cyan hover:underline font-mono"
                      >
                        {tx.txid.slice(0, 10)}...
                      </Link>
                      {tx.transparentAddresses?.[0] && (
                        <Link
                          href={`/address/${tx.transparentAddresses[0]}`}
                          className="text-muted hover:text-secondary font-mono"
                        >
                          ({truncateAddress(tx.transparentAddresses[0])})
                        </Link>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-primary font-mono">{tx.amount.toFixed(4)} ZEC</span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                        tx.warningLevel === 'HIGH'
                          ? 'bg-red-500/20 text-red-600 dark:text-red-400'
                          : tx.warningLevel === 'MEDIUM'
                          ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
                          : 'bg-gray-500/20 text-gray-600 dark:text-gray-400'
                      }`}>
                        {tx.linkabilityScore}
                      </span>
                      <span className="text-muted">{tx.timeDelta}</span>
                    </div>
                  </div>
                </div>
              ))}
              <p className="text-[10px] text-muted italic">
                These are all potential sources. We cannot determine which one is the actual link.
              </p>
            </div>
          )}

          {/* Educational section */}
          <div className="mt-4 pt-3 border-t border-cipher-border/30">
            <button
              onClick={() => setShowAlgorithm(!showAlgorithm)}
              className="flex items-center gap-1.5 text-xs text-muted hover:text-secondary transition-colors"
            >
              <Icons.Info />
              Why is this a privacy risk?
              {showAlgorithm ? <Icons.ChevronUp /> : <Icons.ChevronDown />}
            </button>

            {showAlgorithm && (
              <div className="mt-3 p-3 rounded-lg bg-cipher-bg/50 dark:bg-cipher-surface/30 text-xs text-secondary space-y-3">
                <div>
                  <strong className="text-primary">The problem:</strong>
                  <p className="mt-1">
                    When you shield and then unshield similar amounts, an observer can correlate the two transactions.
                    This reveals which transparent addresses belong to the same person, defeating the privacy of the shielded pool.
                  </p>
                </div>

                <div>
                  <strong className="text-primary">How we detect this:</strong>
                  <ul className="list-disc list-inside mt-1 space-y-1 text-muted">
                    <li>Amount similarity (±{data.algorithm.toleranceZec} ZEC tolerance)</li>
                    <li>Time proximity (within {data.algorithm.maxTimeWindowDays} days)</li>
                    <li>Amount rarity (unique amounts are more suspicious)</li>
                  </ul>
                </div>

                <div className="p-2 rounded bg-cipher-green/10 border border-cipher-green/30">
                  <strong className="text-cipher-green">💡 Best practices for privacy:</strong>
                  <ul className="list-disc list-inside mt-1 space-y-1 text-secondary">
                    <li><strong>ZODL</strong> - Hold your ZEC in the shielded pool longer</li>
                    <li><strong>Different amounts</strong> - Don't unshield the exact same amount you shielded</li>
                    <li><strong>Split transactions</strong> - Divide large amounts into smaller, varied ones</li>
                    <li><strong>Z2Z transactions</strong> - Transact within the shielded pool when possible</li>
                  </ul>
                </div>

                <p className="text-muted italic text-[10px]">
                  Algorithm v{data.algorithm.version} • {data.algorithm.note}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
