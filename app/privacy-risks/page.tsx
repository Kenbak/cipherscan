'use client';

import { useState, useEffect, Suspense, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { usePostgresApiClient, getApiUrl } from '@/lib/api-config';
import { RiskyTxCard } from '@/components/RiskyTxCard';
import { BatchPatternCard, BatchPattern } from '@/components/BatchPatternCard';
import { PrivacyTimelineChart, PrivacyTimelinePoint } from '@/components/PrivacyTimelineChart';
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
    weirdAmount?: number;
  };
  ambiguityScore?: number;
  confidenceMargin?: number;
}

interface BatchStats {
  total: number;
  highRisk: number;
  mediumRisk: number;
  totalZecFlagged: number;
  period: string;
  filteredTotal?: number;
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
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-cipher-orange border-t-transparent"></div>
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

  // Filters - Round Trip
  const [riskFilter, setRiskFilter] = useState<RiskFilter>('ALL');
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>(initialPeriod);
  const [sortBy, setSortBy] = useState<SortOption>('score');
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // Filters - Batch Patterns (server-side with cursor pagination)
  const [batchRiskFilter, setBatchRiskFilter] = useState<RiskFilter>('ALL');
  const [batchSortBy, setBatchSortBy] = useState<SortOption>('score');
  const [batchCursor, setBatchCursor] = useState<{ score?: number; amount?: number; time?: number } | null>(null);
  const [batchHasMore, setBatchHasMore] = useState(false);
  const [batchLoadingMore, setBatchLoadingMore] = useState(false);

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

  const fetchBatchPatterns = async (append: boolean = false) => {
    if (append) {
      setBatchLoadingMore(true);
    } else {
      setBatchLoading(true);
      setBatchCursor(null); // Reset cursor on fresh fetch
    }
    setBatchError(null);

    try {
      // Build URL with filters and cursor
      let url = usePostgresApiClient()
        ? `${getApiUrl()}/api/privacy/batch-risks`
        : `/api/privacy/batch-risks`;

      const params = new URLSearchParams({
        period: periodFilter,
        limit: '20',
        riskLevel: batchRiskFilter,
        sort: batchSortBy,
      });

      // Add cursor for pagination
      if (append && batchCursor) {
        if (batchSortBy === 'score' && batchCursor.score !== undefined && batchCursor.amount !== undefined) {
          params.set('afterScore', batchCursor.score.toString());
          params.set('afterAmount', batchCursor.amount.toString());
        } else if (batchSortBy === 'recent' && batchCursor.time !== undefined) {
          params.set('afterScore', batchCursor.time.toString()); // API uses afterScore for both
        }
      }

      const response = await fetch(`${url}?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch batch patterns');

      const data = await response.json();
      if (data.success) {
        if (append) {
          // Deduplicate by first txid to avoid duplicates on pagination edge
          setBatchPatterns(prev => {
            const existingIds = new Set(prev.map((p: BatchPattern) => p.txids[0]));
            const newPatterns = data.patterns.filter((p: BatchPattern) => !existingIds.has(p.txids[0]));
            return [...prev, ...newPatterns];
          });
        } else {
          setBatchPatterns(data.patterns);
        }
        setBatchStats(data.stats);
        setBatchHasMore(data.pagination.hasMore);
        setBatchCursor(data.pagination.nextCursor);
      } else {
        throw new Error(data.error || 'Unknown error');
      }
    } catch (err) {
      console.error('Error fetching batch patterns:', err);
      setBatchError(err instanceof Error ? err.message : 'Failed to fetch batch patterns');
    } finally {
      setBatchLoading(false);
      setBatchLoadingMore(false);
    }
  };

  useEffect(() => {
    setOffset(0);
    if (activeTab === 'roundtrip') {
      fetchRisks(0, false);
    } else {
      fetchBatchPatterns(false);
    }
    fetchCommonAmounts();
  }, [riskFilter, periodFilter, sortBy, activeTab]);

  // Re-fetch batch patterns when batch filters change
  useEffect(() => {
    if (activeTab === 'batch') {
      fetchBatchPatterns(false);
    }
  }, [batchRiskFilter, batchSortBy]);

  const loadMore = () => {
    fetchRisks(offset, true);
  };

  const loadMoreBatch = () => {
    fetchBatchPatterns(true);
  };

  const currentStats = activeTab === 'roundtrip' ? stats : batchStats;
  const aggregateTimeline = useMemo<PrivacyTimelinePoint[]>(() => {
    if (activeTab === 'roundtrip') {
      return transactions.slice(0, 40).map((tx) => ({
        id: `${tx.shieldTxid}-${tx.deshieldTxid}`,
        label: `${tx.shieldAmount.toFixed(4)} -> ${tx.deshieldAmount.toFixed(4)} ZEC`,
        timestamp: tx.deshieldTime,
        value: tx.score,
        score: tx.score,
        kind: tx.warningLevel,
      }));
    }

    return batchPatterns.slice(0, 40).map((pattern) => ({
      id: pattern.clusterHash || pattern.txids[0],
      label: `${pattern.batchCount}x ${pattern.perTxAmountZec.toFixed(4)} ZEC`,
      timestamp: pattern.firstTime,
      value: pattern.batchCount,
      score: pattern.score,
      kind: pattern.warningLevel,
    }));
  }, [activeTab, batchPatterns, transactions]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      {/* Header */}
      <div className="mb-6 animate-fade-in">
        <p className="text-xs text-muted font-mono uppercase tracking-widest mb-3">
          <span className="opacity-50">{'>'}</span> PRIVACY_ANALYSIS
        </p>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl sm:text-3xl font-bold text-primary">
            Privacy Risks
          </h1>
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cipher-green opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-cipher-green"></span>
            </span>
            <Badge color="green">LIVE</Badge>
          </div>
        </div>
        <p className="text-sm text-secondary mt-2">
          Transactions where shielding patterns could reveal address ownership.
        </p>
      </div>

      {/* Two-column layout: main + sidebar */}
      <div className="lg:grid lg:grid-cols-[1fr_260px] lg:gap-6 animate-fade-in-up" style={{ animationDelay: '50ms' }}>

        {/* ── Main Column ── */}
        <div className="min-w-0">
          {/* Tab Navigation */}
          <div className="mb-4">
            <div className="filter-group inline-flex">
              <button
                onClick={() => {
                  setActiveTab('roundtrip');
                  if (periodFilter === '90d') setPeriodFilter('30d');
                }}
                className={`filter-btn flex items-center gap-2 ${activeTab === 'roundtrip' ? 'filter-btn-active' : ''}`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
                Round Trip
              </button>
              <button
                onClick={() => {
                  setActiveTab('batch');
                  if (periodFilter === '24h') setPeriodFilter('7d');
                }}
                className={`filter-btn flex items-center gap-2 ${activeTab === 'batch' ? 'filter-btn-active' : ''}`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
                Batch Patterns
                {batchStats && batchStats.highRisk > 0 && (
                  <span className="ml-1 text-[10px] font-mono bg-white/20 text-white font-bold w-5 h-5 rounded-full inline-flex items-center justify-center">
                    {batchStats.highRisk}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Filters — compact inline */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-4">
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

            <div className="filter-group">
              {(['ALL', 'HIGH', 'MEDIUM'] as RiskFilter[]).map((level) => (
                <button
                  key={level}
                  onClick={() => activeTab === 'roundtrip' ? setRiskFilter(level) : setBatchRiskFilter(level)}
                  className={`filter-btn ${
                    (activeTab === 'roundtrip' ? riskFilter : batchRiskFilter) === level
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

            <div className="filter-group">
              <span className="text-[10px] text-muted px-1.5 hidden sm:inline">Sort</span>
              {(['score', 'recent'] as SortOption[]).map((option) => (
                <button
                  key={option}
                  onClick={() => activeTab === 'roundtrip' ? setSortBy(option) : setBatchSortBy(option)}
                  className={`filter-btn ${(activeTab === 'roundtrip' ? sortBy : batchSortBy) === option ? 'filter-btn-active' : ''}`}
                >
                  {option === 'recent' ? 'Recent' : 'Score'}
                </button>
              ))}
            </div>

            {/* Mobile-only stats (sidebar handles desktop) */}
            {activeTab === 'roundtrip' && stats && (
              <Badge color="muted" className="ml-auto lg:hidden">
                {stats.total} detected
              </Badge>
            )}
            {activeTab === 'batch' && batchStats && (
              <Badge color="orange" className="ml-auto lg:hidden">
                {batchStats?.filteredTotal || batchPatterns.length} patterns
              </Badge>
            )}
          </div>

          {/* Mobile-only: popular amounts as compact pills */}
          {commonAmounts.length > 0 && (
            <div className="lg:hidden mb-4 flex flex-wrap gap-1.5">
              <span className="text-[10px] text-muted font-mono self-center mr-1">Popular:</span>
              {commonAmounts.slice(0, 5).map((amount, i) => (
                <span key={i} className="text-[10px] font-mono text-cipher-purple bg-cipher-purple/10 border border-cipher-purple/20 px-2 py-0.5 rounded-full">
                  {amount.amountZec.toFixed(2)} ZEC
                </span>
              ))}
            </div>
          )}

          {aggregateTimeline.length > 0 && (
            <div className="mb-4">
              <div className="card card-compact">
                <p className="text-[10px] font-mono text-muted uppercase tracking-widest mb-3">
                  <span className="opacity-50">{'>'}</span> {activeTab === 'roundtrip' ? 'LINKAGE_TIMELINE' : 'CLUSTER_TIMELINE'}
                </p>
                <PrivacyTimelineChart
                  points={aggregateTimeline}
                  height={180}
                  yLabel={activeTab === 'roundtrip' ? 'Score' : 'Members'}
                />
              </div>
            </div>
          )}

          {/* Cards */}
          <div className="space-y-3 mb-8">
            {activeTab === 'roundtrip' ? (
              loading ? (
                <div className="space-y-3">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="card card-compact animate-pulse">
                      <div className="flex items-center justify-between mb-3">
                        <div className="h-4 bg-cipher-surface rounded w-32" />
                        <div className="h-3 bg-cipher-surface rounded w-16" />
                      </div>
                      <div className="space-y-2">
                        <div className="h-4 bg-cipher-surface rounded w-full" />
                        <div className="h-3 bg-cipher-surface rounded w-24" />
                        <div className="h-4 bg-cipher-surface rounded w-full" />
                      </div>
                    </div>
                  ))}
                </div>
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

                  {hasMore && (
                    <div className="text-center pt-4">
                      <button
                        onClick={loadMore}
                        disabled={loadingMore}
                        className="btn btn-md btn-secondary disabled:opacity-50"
                      >
                        {loadingMore ? 'Loading...' : `Load More (${stats ? stats.total - transactions.length : '...'} remaining)`}
                      </button>
                    </div>
                  )}

                  {stats && (
                    <p className="text-center text-sm text-muted pt-2">
                      Showing {transactions.length} of {stats.total}
                    </p>
                  )}
                </>
              )
            ) : (
              batchLoading ? (
                <div className="space-y-3">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="card animate-pulse">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-cipher-surface rounded-lg" />
                          <div className="space-y-1.5">
                            <div className="h-4 bg-cipher-surface rounded w-40" />
                            <div className="h-3 bg-cipher-surface rounded w-28" />
                          </div>
                        </div>
                        <div className="h-5 bg-cipher-surface rounded w-20" />
                      </div>
                      <div className="h-3 bg-cipher-surface rounded w-full" />
                    </div>
                  ))}
                </div>
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
                  {batchPatterns.map((pattern) => (
                    <BatchPatternCard key={pattern.txids[0]} pattern={pattern} />
                  ))}

                  {batchHasMore && (
                    <div className="text-center pt-4">
                      <button
                        onClick={loadMoreBatch}
                        disabled={batchLoadingMore}
                        className="btn btn-md btn-secondary disabled:opacity-50"
                      >
                        {batchLoadingMore ? 'Loading...' : 'Load More'}
                      </button>
                    </div>
                  )}

                  {batchStats && (
                    <p className="text-center text-sm text-muted pt-2">
                      Showing {Math.min(batchPatterns.length, batchStats.filteredTotal || batchStats.total)} of {batchStats.filteredTotal || batchStats.total} patterns
                      {batchRiskFilter !== 'ALL' && ` (filtered from ${batchStats.total} total)`}
                    </p>
                  )}
                </>
              )
            )}
          </div>
        </div>

        {/* ── Sidebar (desktop only) ── */}
        <aside className="hidden lg:block">
          <div className="sticky top-24 space-y-4">
            {/* Stats */}
            <div className="card card-compact">
              <p className="text-[10px] font-mono text-muted uppercase tracking-widest mb-3">
                <span className="opacity-50">{'>'}</span> {activeTab === 'roundtrip' ? 'DETECTION_STATS' : 'BATCH_STATS'}
              </p>
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-secondary">Detected</span>
                  <span className="text-base font-mono font-bold text-primary tabular-nums">
                    {activeTab === 'roundtrip' ? (stats?.total || 0) : (batchStats?.filteredTotal || batchStats?.total || 0)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-secondary">High Risk</span>
                  <span className="text-base font-mono font-bold text-red-400 tabular-nums">
                    {currentStats?.highRisk || 0}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-secondary">Medium</span>
                  <span className="text-base font-mono font-bold text-cipher-yellow tabular-nums">
                    {currentStats?.mediumRisk || 0}
                  </span>
                </div>
                {activeTab === 'roundtrip' && stats && (
                  <div className="flex items-center justify-between pt-1 border-t border-cipher-border">
                    <span className="text-xs text-secondary">Avg Score</span>
                    <span className="text-sm font-mono font-semibold text-primary tabular-nums">
                      {Math.round(stats.avgScore)}/100
                    </span>
                  </div>
                )}
                {activeTab === 'batch' && batchStats && (
                  <div className="flex items-center justify-between pt-1 border-t border-cipher-border">
                    <span className="text-xs text-secondary">ZEC Flagged</span>
                    <span className="text-sm font-mono font-semibold text-primary tabular-nums">
                      {batchStats.totalZecFlagged?.toLocaleString() || batchPatterns.reduce((sum, p) => sum + p.totalAmountZec, 0).toLocaleString()}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Popular Amounts */}
            {commonAmounts.length > 0 && (
              <div className="card card-compact">
                <p className="text-[10px] font-mono text-muted uppercase tracking-widest mb-3">
                  <span className="opacity-50">{'>'}</span> POPULAR_AMOUNTS <span className="text-muted/50">({periodFilter})</span>
                </p>
                <div className="space-y-1.5">
                  {commonAmounts.map((amount, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <span className="font-mono text-xs text-primary">{amount.amountZec.toFixed(2)} ZEC</span>
                      <div className="flex items-center gap-2">
                        <div className="w-12 h-1 rounded-full bg-cipher-surface overflow-hidden">
                          <div
                            className="h-full rounded-full bg-cipher-purple/50"
                            style={{ width: `${Math.min(parseFloat(amount.percentage) * 1.5, 100)}%` }}
                          />
                        </div>
                        <span className="text-[10px] font-mono text-muted tabular-nums w-10 text-right">{amount.percentage}%</span>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-muted/60 mt-3">Use common amounts to blend in with the crowd.</p>
              </div>
            )}

            {/* Privacy Tips */}
            <div className="card card-compact">
              <p className="text-[10px] font-mono text-muted uppercase tracking-widest mb-3">
                <span className="opacity-50">{'>'}</span> PRIVACY_TIPS
              </p>
              <div className="space-y-2">
                {[
                  { n: '01', text: 'Shield popular amounts to blend in' },
                  { n: '02', text: 'Wait in the shielded pool (ZODL)' },
                  { n: '03', text: 'Withdraw a different amount' },
                  { n: '04', text: 'Avoid transparent addresses' },
                ].map((tip) => (
                  <div key={tip.n} className="flex gap-2 text-xs">
                    <span className="font-mono text-muted/50 shrink-0">{tip.n}</span>
                    <span className="text-secondary">{tip.text}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Batch explainer (only on batch tab) */}
            {activeTab === 'batch' && (
              <div className="card card-compact">
                <p className="text-[10px] font-mono text-muted uppercase tracking-widest mb-2">
                  <span className="opacity-50">{'>'}</span> ABOUT_BATCH
                </p>
                <p className="text-[11px] text-secondary leading-relaxed">
                  When someone shields a large amount then withdraws in identical chunks,
                  this creates a detectable pattern. ML clustering detects both round and unusual amounts.
                </p>
              </div>
            )}

            {/* Disclaimer */}
            <p className="text-[10px] text-muted/50 leading-relaxed px-1">
              ⚠ Results are heuristic-based (amount + timing). They indicate <em>potential</em> links, not proof.
            </p>
          </div>
        </aside>
      </div>

      {/* Mobile-only disclaimer */}
      <p className="lg:hidden text-[10px] text-muted/50 leading-relaxed mt-2 mb-8">
        ⚠ Results are heuristic-based (amount + timing). They indicate <em>potential</em> links, not proof.
      </p>

    </div>
  );
}
