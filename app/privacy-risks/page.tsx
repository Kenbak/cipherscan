'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePostgresApiClient, getApiUrl } from '@/lib/api-config';
import { RiskyTxCard } from '@/components/RiskyTxCard';

interface RiskyTransaction {
  shieldTxid: string;
  shieldHeight: number;
  shieldTime: number;
  shieldAmount: number;
  shieldPool: string;
  shieldAddresses: string[];
  deshieldTxid: string;
  deshieldHeight: number;
  deshieldTime: number;
  deshieldAmount: number;
  deshieldPool: string;
  deshieldAddresses: string[];
  timeDelta: string;
  timeDeltaSeconds: number;
  score: number;
  warningLevel: 'HIGH' | 'MEDIUM' | 'LOW';
  scoreBreakdown: {
    amountSimilarity: number;
    timeProximity: number;
    amountRarity: number;
  };
}

interface Stats {
  total: number;
  highRisk: number;
  mediumRisk: number;
  avgScore: number;
  period: string;
}

type RiskFilter = 'ALL' | 'HIGH' | 'MEDIUM';
type PeriodFilter = '24h' | '7d' | '30d' | '90d';
type SortOption = 'recent' | 'score';

export default function PrivacyRisksPage() {
  const [transactions, setTransactions] = useState<RiskyTransaction[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [riskFilter, setRiskFilter] = useState<RiskFilter>('ALL');
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('7d');
  const [sortBy, setSortBy] = useState<SortOption>('recent');
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchRisks = async (newOffset: number = 0, append: boolean = false) => {
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const apiUrl = usePostgresApiClient()
        ? `${getApiUrl()}/api/privacy/risks?limit=20&offset=${newOffset}&period=${periodFilter}&riskLevel=${riskFilter}&sort=${sortBy}`
        : `/api/privacy/risks?limit=20&offset=${newOffset}&period=${periodFilter}&riskLevel=${riskFilter}&sort=${sortBy}`;

      const response = await fetch(apiUrl);
      if (!response.ok) throw new Error('Failed to fetch');

      const data = await response.json();
      if (data.success) {
        if (append) {
          setTransactions(prev => [...prev, ...data.transactions]);
        } else {
          setTransactions(data.transactions);
        }
        setStats(data.stats);
        setHasMore(data.pagination.hasMore);
        setOffset(newOffset + data.transactions.length);
      } else {
        throw new Error(data.error || 'Unknown error');
      }
    } catch (err) {
      console.error('Error fetching privacy risks:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    setOffset(0);
    fetchRisks(0, false);
  }, [riskFilter, periodFilter, sortBy]);

  const loadMore = () => {
    fetchRisks(offset, true);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-primary">
            Privacy Risks Detected
          </h1>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
            <span className="text-xs text-gray-500 dark:text-muted font-mono">LIVE</span>
          </div>
        </div>
        <p className="text-gray-600 dark:text-secondary">
          Transactions where shielding and unshielding patterns could reveal address ownership.
        </p>
      </div>

      {/* Educational Section - Top */}
      <div className="mb-8 p-5 rounded-xl bg-purple-50 dark:bg-purple-500/5 border border-purple-200 dark:border-purple-500/20">
        <h2 className="text-sm font-semibold text-purple-700 dark:text-purple-400 mb-4">
          How to protect your privacy
        </h2>
        <div className="grid sm:grid-cols-3 gap-4 text-sm">
          <div>
            <div className="font-medium text-gray-900 dark:text-primary">ZODL</div>
            <p className="text-gray-600 dark:text-secondary text-xs mt-1">
              Hold your ZEC in the shielded pool longer. Time breaks correlation.
            </p>
          </div>
          <div>
            <div className="font-medium text-gray-900 dark:text-primary">Vary amounts</div>
            <p className="text-gray-600 dark:text-secondary text-xs mt-1">
              Don't unshield the exact amount you shielded. Split or combine.
            </p>
          </div>
          <div>
            <div className="font-medium text-gray-900 dark:text-primary">Stay shielded</div>
            <p className="text-gray-600 dark:text-secondary text-xs mt-1">
              Use z-addresses exclusively. Never touch transparent addresses.
            </p>
          </div>
        </div>
        <p className="text-xs text-gray-500 dark:text-muted mt-4 pt-3 border-t border-purple-200 dark:border-purple-500/20">
          ⚠️ These results are based on heuristics (amount + timing). They indicate <em>potential</em> links, not proof.
        </p>
      </div>

      {/* Filters - Simple */}
      <div className="flex flex-wrap items-center gap-4 mb-6">
        {/* Period Filter */}
        <div className="flex rounded-lg overflow-hidden border border-gray-200 dark:border-cipher-border">
          {(['24h', '7d', '30d'] as PeriodFilter[]).map((period) => (
            <button
              key={period}
              onClick={() => setPeriodFilter(period)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                periodFilter === period
                  ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900'
                  : 'bg-white dark:bg-transparent text-gray-600 dark:text-secondary hover:bg-gray-50 dark:hover:bg-cipher-surface/50'
              }`}
            >
              {period}
            </button>
          ))}
        </div>

        {/* Risk Level Filter */}
        <div className="flex rounded-lg overflow-hidden border border-gray-200 dark:border-cipher-border">
          {(['ALL', 'HIGH', 'MEDIUM'] as RiskFilter[]).map((level) => (
            <button
              key={level}
              onClick={() => setRiskFilter(level)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                riskFilter === level
                  ? level === 'HIGH'
                    ? 'bg-red-500 text-white'
                    : level === 'MEDIUM'
                    ? 'bg-amber-500 text-white'
                    : 'bg-gray-900 dark:bg-white text-white dark:text-gray-900'
                  : 'bg-white dark:bg-transparent text-gray-600 dark:text-secondary hover:bg-gray-50 dark:hover:bg-cipher-surface/50'
              }`}
            >
              {level === 'ALL' ? 'All' : level === 'HIGH' ? 'High Risk' : 'Medium'}
            </button>
          ))}
        </div>

        {/* Sort Toggle */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500 dark:text-muted">Sort:</span>
          <div className="flex rounded-lg overflow-hidden border border-gray-200 dark:border-cipher-border">
            {(['recent', 'score'] as SortOption[]).map((option) => (
              <button
                key={option}
                onClick={() => setSortBy(option)}
                className={`px-3 py-2 text-sm font-medium transition-colors ${
                  sortBy === option
                    ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900'
                    : 'bg-white dark:bg-transparent text-gray-600 dark:text-secondary hover:bg-gray-50 dark:hover:bg-cipher-surface/50'
                }`}
              >
                {option === 'recent' ? 'Recent' : 'Score'}
              </button>
            ))}
          </div>
        </div>

        {/* Stats inline */}
        {stats && (
          <div className="ml-auto text-sm text-gray-500 dark:text-muted">
            {stats.total} detected
          </div>
        )}
      </div>

      {/* Transaction Feed */}
      <div className="space-y-4 mb-12">
        {loading ? (
          <div className="py-16 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-400 mx-auto mb-4"></div>
            <p className="text-gray-500 dark:text-muted">Loading...</p>
          </div>
        ) : error ? (
          <div className="py-16 text-center">
            <p className="text-red-600 dark:text-red-400">{error}</p>
          </div>
        ) : transactions.length === 0 ? (
          <div className="py-16 text-center">
            <div className="text-4xl mb-4">🛡️</div>
            <p className="text-gray-600 dark:text-secondary">No risky transactions detected.</p>
            <p className="text-sm text-gray-500 dark:text-muted mt-2">Try a longer time period.</p>
          </div>
        ) : (
          <>
            {transactions.map((tx, index) => (
              <RiskyTxCard key={`${tx.shieldTxid}-${tx.deshieldTxid}-${index}`} tx={tx} />
            ))}

            {/* Load More */}
            {hasMore && (
              <div className="text-center pt-4">
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="px-6 py-3 bg-gray-100 dark:bg-cipher-surface hover:bg-gray-200 dark:hover:bg-cipher-surface/80 text-gray-700 dark:text-secondary rounded-lg font-medium transition-colors disabled:opacity-50"
                >
                  {loadingMore ? 'Loading...' : 'Load More'}
                </button>
              </div>
            )}

            {/* Showing count */}
            {stats && (
              <p className="text-center text-sm text-gray-500 dark:text-muted pt-2">
                Showing {transactions.length} of {stats.total}
              </p>
            )}
          </>
        )}
      </div>

      {/* Back Link */}
      <div className="mt-6 pt-4 border-t border-gray-200 dark:border-cipher-border">
        <Link
          href="/privacy"
          className="text-gray-500 dark:text-muted hover:text-gray-700 dark:hover:text-secondary text-sm"
        >
          ← Back to Privacy Metrics
        </Link>
      </div>
    </div>
  );
}
