'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { usePostgresApiClient, getApiUrl } from '@/lib/api-config';
import { RiskyTxCard } from '@/components/RiskyTxCard';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';

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

// Wrapper component with Suspense for useSearchParams
export default function PrivacyRisksPage() {
  return (
    <Suspense fallback={<PrivacyRisksLoading />}>
      <PrivacyRisksContent />
    </Suspense>
  );
}

function PrivacyRisksLoading() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Card>
        <CardBody className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-red-400 border-t-transparent"></div>
          <p className="text-secondary ml-4 font-mono">Scanning for privacy risks...</p>
        </CardBody>
      </Card>
    </div>
  );
}

interface CommonAmount {
  amountZec: number;
  txCount: number;
  percentage: string;
  blendingScore: number;
}

function PrivacyRisksContent() {
  const searchParams = useSearchParams();
  const initialPeriod = (searchParams.get('period') as PeriodFilter) || '7d';

  const [transactions, setTransactions] = useState<RiskyTransaction[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [riskFilter, setRiskFilter] = useState<RiskFilter>('ALL');
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>(initialPeriod);
  const [sortBy, setSortBy] = useState<SortOption>('recent');
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // Common amounts
  const [commonAmounts, setCommonAmounts] = useState<CommonAmount[]>([]);

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

  const fetchCommonAmounts = async () => {
    try {
      const apiUrl = usePostgresApiClient()
        ? `${getApiUrl()}/api/privacy/common-amounts?period=${periodFilter}&limit=8`
        : `/api/privacy/common-amounts?period=${periodFilter}&limit=8`;

      const response = await fetch(apiUrl);
        if (response.ok) {
          const data = await response.json();
          if (data.success) {
            // Filter out very low percentages (< 0.3%) but keep variety
            const meaningful = data.amounts.filter((a: CommonAmount) => parseFloat(a.percentage) >= 0.3);
            setCommonAmounts(meaningful.length > 0 ? meaningful : data.amounts.slice(0, 5));
          }
        }
    } catch (err) {
      console.error('Error fetching common amounts:', err);
    }
  };

  useEffect(() => {
    setOffset(0);
    fetchRisks(0, false);
    fetchCommonAmounts();
  }, [riskFilter, periodFilter, sortBy]);

  const loadMore = () => {
    fetchRisks(offset, true);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-12 h-12 rounded-xl bg-red-500/10 flex items-center justify-center text-red-400">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl sm:text-3xl font-bold text-primary">
                Privacy Risks
              </h1>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                <Badge color="orange">LIVE</Badge>
              </div>
            </div>
            <p className="text-sm text-secondary mt-1">
              Transactions where shielding patterns could reveal address ownership.
            </p>
          </div>
        </div>
      </div>

      {/* Educational Section - Combined */}
      <Card className="mb-8 border-purple-500/20">
        <CardBody>
          <h2 className="text-sm font-semibold text-purple-400 mb-4 flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            How to protect your privacy
          </h2>

          {/* Tips */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm mb-5">
            <div className="p-3 rounded-lg bg-cipher-surface">
              <div className="font-medium text-primary text-sm mb-1">1. Common amounts</div>
              <p className="text-muted text-xs hidden sm:block">
                Shield popular amounts to blend in.
              </p>
            </div>
            <div className="p-3 rounded-lg bg-cipher-surface">
              <div className="font-medium text-primary text-sm mb-1">2. ZODL</div>
              <p className="text-muted text-xs hidden sm:block">
                Wait in the shielded pool.
              </p>
            </div>
            <div className="p-3 rounded-lg bg-cipher-surface">
              <div className="font-medium text-primary text-sm mb-1">3. Vary amounts</div>
              <p className="text-muted text-xs hidden sm:block">
                Withdraw different amount.
              </p>
            </div>
            <div className="p-3 rounded-lg bg-cipher-surface">
              <div className="font-medium text-primary text-sm mb-1">4. Stay shielded</div>
              <p className="text-muted text-xs hidden sm:block">
                Avoid transparent addresses.
              </p>
            </div>
          </div>

          {/* Common Amounts */}
          {commonAmounts.length > 0 && (
            <div className="pt-4 border-t border-cipher-border">
              <div className="text-xs text-secondary mb-3 flex items-center gap-2">
                <span className="font-medium text-purple-400">Popular amounts ({periodFilter}):</span>
                <span className="hidden sm:inline text-muted">Use these to blend in</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {commonAmounts.map((amount, i) => (
                  <Badge key={i} color="purple" className="text-sm py-1.5 px-3">
                    <span className="font-mono font-medium">
                      {amount.amountZec.toFixed(2)} ZEC
                    </span>
                    <span className="text-purple-300 ml-2 hidden sm:inline">
                      ({amount.percentage}%)
                    </span>
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <p className="text-xs text-muted mt-5 pt-4 border-t border-cipher-border">
            ⚠️ These results are based on heuristics (amount + timing). They indicate <em>potential</em> links, not proof.
          </p>
        </CardBody>
      </Card>

      {/* Filters - Mobile Friendly */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-4 mb-6">
        {/* Period Filter */}
        <div className="flex rounded-lg overflow-hidden border border-gray-200 dark:border-cipher-border">
          {(['24h', '7d', '30d'] as PeriodFilter[]).map((period) => (
            <button
              key={period}
              onClick={() => setPeriodFilter(period)}
              className={`px-2.5 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium transition-colors ${
                periodFilter === period
                  ? 'bg-purple-600 dark:bg-purple-500 text-white'
                  : 'bg-white dark:bg-cipher-surface text-gray-600 dark:text-secondary hover:bg-gray-50 dark:hover:bg-cipher-surface/80'
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
              className={`px-2.5 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium transition-colors ${
                riskFilter === level
                  ? level === 'HIGH'
                    ? 'bg-red-500 text-white'
                    : level === 'MEDIUM'
                    ? 'bg-amber-500 text-white'
                    : 'bg-purple-600 dark:bg-purple-500 text-white'
                  : 'bg-white dark:bg-cipher-surface text-gray-600 dark:text-secondary hover:bg-gray-50 dark:hover:bg-cipher-surface/80'
              }`}
            >
              {level === 'ALL' ? 'All' : level === 'HIGH' ? 'High' : 'Med'}
            </button>
          ))}
        </div>

        {/* Sort Toggle */}
        <div className="flex items-center gap-2">
          <span className="text-xs sm:text-sm text-gray-500 dark:text-muted">Sort:</span>
          <div className="flex rounded-lg overflow-hidden border border-gray-200 dark:border-cipher-border">
            {(['recent', 'score'] as SortOption[]).map((option) => (
              <button
                key={option}
                onClick={() => setSortBy(option)}
                className={`px-2.5 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm font-medium transition-colors ${
                  sortBy === option
                    ? 'bg-purple-600 dark:bg-purple-500 text-white'
                    : 'bg-white dark:bg-cipher-surface text-gray-600 dark:text-secondary hover:bg-gray-50 dark:hover:bg-cipher-surface/80'
                }`}
              >
                {option === 'recent' ? 'Recent' : 'Score'}
              </button>
            ))}
          </div>
        </div>

        {/* Stats inline */}
        {stats && (
          <div className="sm:ml-auto text-xs sm:text-sm text-gray-500 dark:text-muted">
            {stats.total} detected
          </div>
        )}
      </div>

      {/* Transaction Feed */}
      <div className="space-y-4 mb-12">
        {loading ? (
          <Card>
            <CardBody className="py-16 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-red-400 border-t-transparent mx-auto mb-4"></div>
              <p className="text-muted">Loading...</p>
            </CardBody>
          </Card>
        ) : error ? (
          <Card>
            <CardBody className="py-16 text-center">
              <p className="text-red-400">{error}</p>
            </CardBody>
          </Card>
        ) : transactions.length === 0 ? (
          <Card>
            <CardBody className="py-16 text-center">
              <div className="text-5xl mb-4">🛡️</div>
              <p className="text-secondary text-lg">No risky transactions detected.</p>
              <p className="text-sm text-muted mt-2">Try a longer time period.</p>
            </CardBody>
          </Card>
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
                  className="px-6 py-3 bg-cipher-surface hover:bg-cipher-hover text-secondary rounded-xl font-medium transition-colors disabled:opacity-50 border border-cipher-border"
                >
                  {loadingMore ? 'Loading...' : 'Load More'}
                </button>
              </div>
            )}

            {/* Showing count */}
            {stats && (
              <p className="text-center text-sm text-muted pt-2">
                Showing {transactions.length} of {stats.total}
              </p>
            )}
          </>
        )}
      </div>

      {/* Back Link */}
      <div className="mt-6 pt-6 border-t border-cipher-border">
        <Link
          href="/privacy"
          className="text-muted hover:text-cipher-cyan text-sm font-mono transition-colors"
        >
          ← Back to Privacy Metrics
        </Link>
      </div>
    </div>
  );
}
