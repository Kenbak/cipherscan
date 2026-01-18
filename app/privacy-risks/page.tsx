'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { usePostgresApiClient, getApiUrl } from '@/lib/api-config';
import { RiskyTxCard } from '@/components/RiskyTxCard';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

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

interface BatchPattern {
  patternType: string;
  perTxAmountZec: number;
  batchCount: number;
  totalAmountZec: number;
  txids: string[];
  heights: number[];
  times: number[];
  addresses?: string[];
  addressCount?: number;
  sameAddressRatio?: number;
  firstTime: number;
  lastTime: number;
  timeSpanHours: number;
  shieldToFirstDeshieldHours?: number | null;
  isRoundNumber: boolean;
  matchingShield: {
    txid: string;
    amountZec: number;
    blockHeight: number;
    blockTime: number;
  } | null;
  score: number;
  warningLevel: 'HIGH' | 'MEDIUM' | 'LOW';
  explanation: string;
  breakdown: {
    batchCount: { count: number; points: number };
    roundNumber: { amountZec: number; isRound: boolean; points: number };
    matchingShield: { found: boolean; txid: string | null; points: number };
    timeClustering: { hours: number; points: number };
    addressAnalysis?: { totalAddresses: number; uniqueAddresses: number; sameAddressRatio: number; topAddresses: string[]; points: number };
    shieldTiming?: { hoursAfterShield: number | null; points: number };
  };
}

interface BatchStats {
  total: number;
  highRisk: number;
  mediumRisk: number;
  totalZecFlagged: number;
  period: string;
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
type TabType = 'roundtrip' | 'batch';

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
  const initialTab = (searchParams.get('tab') as TabType) || 'roundtrip';

  // Tab state
  const [activeTab, setActiveTab] = useState<TabType>(initialTab);

  const [transactions, setTransactions] = useState<RiskyTransaction[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Batch patterns state
  const [batchPatterns, setBatchPatterns] = useState<BatchPattern[]>([]);
  const [batchStats, setBatchStats] = useState<BatchStats | null>(null);
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchError, setBatchError] = useState<string | null>(null);

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

  const fetchBatchPatterns = async () => {
    setBatchLoading(true);
    setBatchError(null);

    try {
      const apiUrl = usePostgresApiClient()
        ? `${getApiUrl()}/api/privacy/batch-risks?period=${periodFilter}&limit=50`
        : `/api/privacy/batch-risks?period=${periodFilter}&limit=50`;

      const response = await fetch(apiUrl);
      if (!response.ok) throw new Error('Failed to fetch batch patterns');

      const data = await response.json();
      if (data.success) {
        setBatchPatterns(data.patterns);
        setBatchStats(data.stats);
      } else {
        throw new Error(data.error || 'Unknown error');
      }
    } catch (err) {
      console.error('Error fetching batch patterns:', err);
      setBatchError(err instanceof Error ? err.message : 'Failed to fetch batch patterns');
    } finally {
      setBatchLoading(false);
    }
  };

  useEffect(() => {
    setOffset(0);
    if (activeTab === 'roundtrip') {
      fetchRisks(0, false);
    } else {
      fetchBatchPatterns();
    }
    fetchCommonAmounts();
  }, [riskFilter, periodFilter, sortBy, activeTab]);

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

      {/* Tab Navigation */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => {
            setActiveTab('roundtrip');
            // Reset to valid period for roundtrip if current is invalid
            if (periodFilter === '90d') setPeriodFilter('30d');
          }}
          className={`px-4 py-2 rounded-lg font-medium text-sm transition-all ${
            activeTab === 'roundtrip'
              ? 'bg-red-500/20 text-red-400 border border-red-500/30'
              : 'bg-cipher-surface text-secondary hover:text-primary border border-transparent'
          }`}
        >
          <span className="flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
            Round Trip
          </span>
        </button>
        <button
          onClick={() => {
            setActiveTab('batch');
            // Reset to valid period for batch if current is invalid
            if (periodFilter === '24h') setPeriodFilter('7d');
          }}
          className={`px-4 py-2 rounded-lg font-medium text-sm transition-all ${
            activeTab === 'batch'
              ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
              : 'bg-cipher-surface text-secondary hover:text-primary border border-transparent'
          }`}
        >
          <span className="flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            Batch Patterns
            {batchStats && batchStats.highRisk > 0 && (
              <span className="bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full">
                {batchStats.highRisk}
              </span>
            )}
          </span>
        </button>
      </div>

      {/* Filters - Mobile Friendly */}
      <Card variant="compact" className="mb-6">
        <CardBody>
          <div className="flex flex-wrap items-center gap-3 sm:gap-4">
            {/* Period Filter - Different options per tab */}
            <div className="filter-group">
              {(activeTab === 'roundtrip'
                ? ['24h', '7d', '30d']
                : ['7d', '30d', '90d']
              ).map((period) => (
                <button
                  key={period}
                  onClick={() => setPeriodFilter(period as PeriodFilter)}
                  className={`filter-btn ${periodFilter === period ? 'filter-btn-active' : ''}`}
                >
                  {period}
                </button>
              ))}
            </div>

            {activeTab === 'roundtrip' && (
              <>
                {/* Risk Level Filter */}
                <div className="filter-group">
                  {(['ALL', 'HIGH', 'MEDIUM'] as RiskFilter[]).map((level) => (
                    <button
                      key={level}
                      onClick={() => setRiskFilter(level)}
                      className={`filter-btn ${
                        riskFilter === level
                          ? level === 'HIGH'
                            ? 'filter-btn-danger'
                            : level === 'MEDIUM'
                            ? 'filter-btn-warning'
                            : 'filter-btn-active'
                          : ''
                      }`}
                    >
                      {level === 'ALL' ? 'All' : level === 'HIGH' ? 'High' : 'Med'}
                    </button>
                  ))}
                </div>

                {/* Sort Toggle */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted">Sort:</span>
                  <div className="filter-group">
                    {(['recent', 'score'] as SortOption[]).map((option) => (
                      <button
                        key={option}
                        onClick={() => setSortBy(option)}
                        className={`filter-btn ${sortBy === option ? 'filter-btn-active' : ''}`}
                      >
                        {option === 'recent' ? 'Recent' : 'Score'}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Stats inline */}
            {activeTab === 'roundtrip' && stats && (
              <Badge color="muted" className="ml-auto">
                {stats.total} detected
              </Badge>
            )}
            {activeTab === 'batch' && batchStats && (
              <Badge color="orange" className="ml-auto">
                {batchStats.total} patterns • {batchStats.totalZecFlagged.toLocaleString()} ZEC
              </Badge>
            )}
          </div>
        </CardBody>
      </Card>

      {/* Content based on active tab */}
      <div className="space-y-4 mb-12">
        {activeTab === 'roundtrip' ? (
          /* Round Trip Transactions */
          loading ? (
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
                <div className="w-16 h-16 rounded-2xl bg-cipher-green/10 flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-cipher-green" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <p className="text-primary text-lg font-medium">No risky transactions detected</p>
                <p className="text-sm text-secondary mt-2">Try a longer time period.</p>
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
                  <Button
                    onClick={loadMore}
                    disabled={loadingMore}
                    variant="secondary"
                    size="lg"
                  >
                    {loadingMore ? 'Loading...' : 'Load More'}
                  </Button>
                </div>
              )}

              {/* Showing count */}
              {stats && (
                <p className="text-center text-sm text-muted pt-2">
                  Showing {transactions.length} of {stats.total}
                </p>
              )}
            </>
          )
        ) : (
          /* Batch Patterns */
          batchLoading ? (
            <Card>
              <CardBody className="py-16 text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-orange-400 border-t-transparent mx-auto mb-4"></div>
                <p className="text-muted">Detecting batch patterns...</p>
              </CardBody>
            </Card>
          ) : batchError ? (
            <Card>
              <CardBody className="py-16 text-center">
                <p className="text-red-400">{batchError}</p>
              </CardBody>
            </Card>
          ) : batchPatterns.length === 0 ? (
            <Card>
              <CardBody className="py-16 text-center">
                <div className="w-16 h-16 rounded-2xl bg-cipher-green/10 flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-cipher-green" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <p className="text-primary text-lg font-medium">No batch patterns detected</p>
                <p className="text-sm text-secondary mt-2">Try a longer time period.</p>
              </CardBody>
            </Card>
          ) : (
            <>
              {/* Batch Patterns Info */}
              <Card className="border-orange-500/20 mb-4">
                <CardBody>
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center flex-shrink-0">
                      <svg className="w-5 h-5 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-orange-400 mb-1">What are Batch Patterns?</h3>
                      <p className="text-xs text-secondary">
                        When someone shields a large amount then withdraws in identical chunks (e.g., 6000 ZEC → 12×500 ZEC),
                        this creates a detectable pattern even without direct links. ML clustering detects both round and unusual amounts.
                      </p>
                    </div>
                  </div>
                </CardBody>
              </Card>

              {/* Pattern Cards */}
              {batchPatterns.map((pattern, index) => (
                <BatchPatternCard key={`batch-${index}`} pattern={pattern} />
              ))}

              {/* Stats */}
              {batchStats && (
                <p className="text-center text-sm text-muted pt-2">
                  {batchStats.total} patterns detected • {batchStats.totalZecFlagged.toLocaleString()} ZEC flagged
                </p>
              )}
            </>
          )
        )}
      </div>

      {/* Back Link */}
      <div className="mt-8 pt-6 border-t border-cipher-border">
        <Link
          href="/privacy"
          className="inline-flex items-center gap-2 text-secondary hover:text-cipher-cyan text-sm font-mono transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to Privacy Dashboard
        </Link>
      </div>
    </div>
  );
}

// Batch Pattern Card Component
function BatchPatternCard({ pattern }: { pattern: BatchPattern }) {
  const [expanded, setExpanded] = useState(false);

  // Map warning levels to available Badge colors
  const badgeColor: 'orange' | 'purple' | 'muted' = pattern.warningLevel === 'HIGH'
    ? 'orange'
    : pattern.warningLevel === 'MEDIUM'
    ? 'purple'
    : 'muted';

  const borderColor = pattern.warningLevel === 'HIGH'
    ? 'border-red-500/30'
    : pattern.warningLevel === 'MEDIUM'
    ? 'border-orange-500/30'
    : 'border-yellow-500/30';

  const formatTime = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <Card className={`${borderColor} hover:border-opacity-50 transition-colors`}>
      <CardBody>
        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg ${pattern.warningLevel === 'HIGH' ? 'bg-red-500/10' : pattern.warningLevel === 'MEDIUM' ? 'bg-orange-500/10' : 'bg-yellow-500/10'} flex items-center justify-center flex-shrink-0`}>
              <span className="text-lg font-bold text-primary">{pattern.batchCount}×</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-lg font-bold text-primary">
                  {pattern.perTxAmountZec.toFixed(4)} ZEC
                </span>
                <span className="text-muted">each</span>
                {!pattern.isRoundNumber && pattern.batchCount >= 5 && (
                  <Badge color="orange" className="text-xs">NON-ROUND</Badge>
                )}
              </div>
              <div className="text-sm text-secondary">
                Total: <span className="font-mono font-medium text-primary">{pattern.totalAmountZec.toLocaleString()} ZEC</span>
              </div>
            </div>
          </div>

          <div className="text-right flex-shrink-0">
            <Badge color={badgeColor}>
              Score: {pattern.score}
            </Badge>
            <div className="text-xs text-muted mt-1">
              {pattern.timeSpanHours < 24
                ? `${Math.round(pattern.timeSpanHours)}h span`
                : `${Math.round(pattern.timeSpanHours / 24)}d span`
              }
            </div>
          </div>
        </div>

        {/* Matching Shield */}
        {pattern.matchingShield && (
          <div className="bg-cipher-surface rounded-lg p-3 mb-3">
            <div className="flex items-center gap-2 text-sm">
              <svg className="w-4 h-4 text-cipher-green" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <span className="text-cipher-green font-medium">Matches Shield:</span>
              <Link
                href={`/tx/${pattern.matchingShield.txid}`}
                className="font-mono text-cipher-cyan hover:underline"
              >
                {pattern.matchingShield.txid.slice(0, 12)}...
              </Link>
              <span className="text-muted">
                ({pattern.matchingShield.amountZec.toLocaleString()} ZEC)
              </span>
            </div>
          </div>
        )}

        {/* Explanation */}
        <p className="text-sm text-secondary mb-3">{pattern.explanation}</p>

        {/* Expand/Collapse for TXIDs */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-cipher-cyan hover:underline flex items-center gap-1"
        >
          {expanded ? 'Hide' : 'Show'} {pattern.batchCount} transactions
          <svg
            className={`w-3 h-3 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {expanded && (
          <div className="mt-3 pt-3 border-t border-cipher-border">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-60 overflow-y-auto">
              {pattern.txids.slice(0, 20).map((txid, i) => (
                <Link
                  key={txid}
                  href={`/tx/${txid}`}
                  className="font-mono text-xs text-secondary hover:text-cipher-cyan flex items-center gap-2"
                >
                  <span className="text-muted w-6">{i + 1}.</span>
                  {txid.slice(0, 16)}...
                  <span className="text-muted text-[10px]">
                    {formatTime(pattern.times[i])}
                  </span>
                </Link>
              ))}
              {pattern.txids.length > 20 && (
                <p className="text-xs text-muted col-span-2">
                  ...and {pattern.txids.length - 20} more
                </p>
              )}
            </div>
          </div>
        )}

        {/* Score Breakdown */}
        <div className="mt-3 pt-3 border-t border-cipher-border flex flex-wrap gap-3 text-xs text-muted">
          <span title="More identical deshields = higher score">Batch: +{pattern.breakdown.batchCount.points}</span>
          <span title="Round amounts (50, 100, 500 ZEC) = suspicious">Round: +{pattern.breakdown.roundNumber.points}</span>
          <span title="Matching shield found for total amount">Shield: +{pattern.breakdown.matchingShield.points}</span>
          <span title="Deshields clustered in time = suspicious">Time: +{pattern.breakdown.timeClustering.points}</span>
          {pattern.breakdown.addressAnalysis && (
            <span title="Same address receives multiple deshields" className={pattern.breakdown.addressAnalysis.points > 0 ? 'text-orange-400' : ''}>
              Addr: +{pattern.breakdown.addressAnalysis.points}
            </span>
          )}
          {pattern.breakdown.shieldTiming && pattern.breakdown.shieldTiming.hoursAfterShield !== null && (
            <span title="Time between shield and first deshield">
              Delay: +{pattern.breakdown.shieldTiming.points}
            </span>
          )}
        </div>

        {/* Address Warning */}
        {pattern.breakdown.addressAnalysis && pattern.breakdown.addressAnalysis.uniqueAddresses === 1 && pattern.batchCount >= 3 && (
          <div className="mt-2 p-2 rounded bg-red-500/10 border border-red-500/30 text-xs text-red-400">
            ⚠️ All {pattern.batchCount} deshields go to the <span className="font-mono">{pattern.breakdown.addressAnalysis.topAddresses[0]?.slice(0, 16)}...</span>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
