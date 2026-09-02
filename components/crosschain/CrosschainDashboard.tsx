'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { MetricCard } from '@/components/ui/MetricCard';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { Badge } from '@/components/ui/Badge';
import { TokenChainIcon } from '@/components/TokenChainIcon';
import { PageSectionNav, type PageSection } from '@/components/PageSectionNav';
import { WrappedZecTracker, type WrappedZecAsset } from '@/components/crosschain/WrappedZecTracker';
import { VolumeTrendsChart } from '@/components/crosschain/VolumeTrendsChart';
import { ChainFlowTable } from '@/components/crosschain/ChainFlowTable';
import { LatencyComparisonChart } from '@/components/crosschain/LatencyComparisonChart';
import { TopPairsList } from '@/components/crosschain/TopPairsList';
import { SwapSizeDistribution } from '@/components/crosschain/SwapSizeDistribution';
import { formatValue, formatAmount, formatRelativeTime, type DisplayUnit } from '@/components/crosschain/format';
import { usePostgresApiClient, getApiUrl } from '@/lib/api-config';

const CHAIN_NAMES: Record<string, string> = {
  btc: 'Bitcoin', eth: 'Ethereum', sol: 'Solana', near: 'NEAR',
  doge: 'Dogecoin', xrp: 'Ripple', zec: 'Zcash', base: 'Base',
  arb: 'Arbitrum', pol: 'Polygon', avax: 'Avalanche', trx: 'Tron',
  apt: 'Aptos', sui: 'Sui', ton: 'TON', bnb: 'BNB Chain',
  op: 'Optimism', ltc: 'Litecoin', tron: 'Tron', bsc: 'BNB Chain',
  dash: 'Dash', gnosis: 'Gnosis', monad: 'Monad',
};

const CHAIN_EXPLORERS: Record<string, string> = {
  eth: 'https://etherscan.io/tx/', sol: 'https://solscan.io/tx/',
  btc: 'https://mempool.space/tx/', base: 'https://basescan.org/tx/',
  arb: 'https://arbiscan.io/tx/', pol: 'https://polygonscan.com/tx/',
  avax: 'https://snowscan.xyz/tx/', trx: 'https://tronscan.org/#/transaction/',
  near: 'https://nearblocks.io/txns/', bnb: 'https://bscscan.com/tx/',
  op: 'https://optimistic.etherscan.io/tx/', doge: 'https://dogechain.info/tx/',
  xrp: 'https://xrpscan.com/tx/', ltc: 'https://blockchair.com/litecoin/transaction/',
  ton: 'https://tonscan.org/tx/', apt: 'https://aptoscan.com/transaction/',
  sui: 'https://suiscan.xyz/mainnet/tx/', tron: 'https://tronscan.org/#/transaction/',
  bsc: 'https://bscscan.com/tx/',
};

interface TokenVolume { symbol: string; volume24h: number }
interface ChainGroup {
  chain: string; chainName: string; totalVolume24h: number; tokens: TokenVolume[];
}
interface RecentSwap {
  id: string; timestamp: number;
  fromChain: string; toChain: string;
  fromAmount: number; fromSymbol: string;
  toAmount: number; toSymbol: string;
  direction: 'in' | 'out'; status: string;
  amountUsd?: number; zecTxid?: string;
  sourceTxHash?: string; destTxHash?: string;
}
interface LatencyStat {
  chain: string; chainName: string;
  avgMinutes: number; medianMinutes: number; swapCount: number;
}
interface CrossChainStats {
  totalVolume24h: number; totalSwaps24h: number;
  totalSwapsAllTime: number; totalVolumeAllTime: number;
  inflows: ChainGroup[]; outflows: ChainGroup[];
  recentSwaps: RecentSwap[];
  latencyByChain: LatencyStat[]; latencyOutflows: LatencyStat[];
  uniqueWallets30d?: number;
}
interface PopularPair { chain: string; token: string; swapCount: number }

type SwapFilter = 'all' | 'in' | 'out';
const SWAPS_PER_PAGE = 15;

const SECTIONS: readonly PageSection[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'flows', label: 'Flows' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'ecosystem', label: 'Ecosystem' },
] as const;

function getSwapExplorerUrl(swap: RecentSwap): string | null {
  if (swap.zecTxid) return `/tx/${swap.zecTxid}`;
  if (swap.direction === 'in' && swap.sourceTxHash) {
    const explorer = CHAIN_EXPLORERS[swap.fromChain];
    if (explorer) return `${explorer}${swap.sourceTxHash}`;
  }
  if (swap.direction === 'out' && swap.destTxHash) {
    const explorer = CHAIN_EXPLORERS[swap.toChain];
    if (explorer) return `${explorer}${swap.destTxHash}`;
  }
  return null;
}

export function CrosschainDashboard() {
  const [stats, setStats] = useState<CrossChainStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasFetchedOnce = useRef(false);
  const [swapFilter, setSwapFilter] = useState<SwapFilter>('all');
  const [swapPage, setSwapPage] = useState(1);
  const [historySwaps, setHistorySwaps] = useState<RecentSwap[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [popularPairs, setPopularPairs] = useState<PopularPair[]>([]);
  const [wrappedZec, setWrappedZec] = useState<{ assets: WrappedZecAsset[]; totalWrapped: number } | null>(null);
  const [unit, setUnit] = useState<DisplayUnit>('usd');
  const [zecPrice, setZecPrice] = useState<number | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        if (!hasFetchedOnce.current) setLoading(true);
        setError(null);
        const apiUrl = usePostgresApiClient()
          ? `${getApiUrl()}/api/crosschain/db-stats`
          : '/api/crosschain/db-stats';
        const response = await fetch(apiUrl);
        const data = await response.json();
        if (!data.success) { setError(data.error || 'Failed to fetch data'); return; }

        const buildGroups = (list: any[]): ChainGroup[] => (list || []).map((c: any) => ({
          chain: c.chain,
          chainName: CHAIN_NAMES[c.chain] || c.chainName || c.chain,
          totalVolume24h: c.totalVolume24h || c.volumeUsd || 0,
          tokens: c.tokens || [],
        }));

        const transformedStats: CrossChainStats = {
          totalVolume24h: data.totalVolume24h || 0,
          totalSwaps24h: data.totalSwaps24h || 0,
          totalSwapsAllTime: data.totalSwapsAllTime || 0,
          totalVolumeAllTime: data.totalVolumeAllTime || 0,
          inflows: buildGroups(data.inflows),
          outflows: buildGroups(data.outflows),
          recentSwaps: (data.recentSwaps || []).map((swap: any) => ({
            id: swap.id, timestamp: swap.timestamp, fromChain: swap.fromChain,
            fromAmount: swap.fromAmount, fromSymbol: swap.fromSymbol,
            toChain: swap.toChain, toSymbol: swap.toSymbol, toAmount: swap.toAmount,
            amountUsd: swap.amountUsd, direction: swap.direction, status: swap.status,
            zecTxid: swap.zecTxid, sourceTxHash: swap.sourceTxHash, destTxHash: swap.destTxHash,
          })),
          latencyByChain: data.latencyByChain || [],
          latencyOutflows: data.latencyOutflows || [],
          uniqueWallets30d: data.uniqueWallets30d,
        };
        setStats(transformedStats);
        hasFetchedOnce.current = true;
      } catch (err) {
        console.error('Error fetching cross-chain stats:', err);
        setError('Failed to connect to API');
      } finally { setLoading(false); }
    };
    fetchStats();
    const interval = setInterval(fetchStats, 120000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const fetchPrice = async () => {
      try {
        const apiUrl = usePostgresApiClient()
          ? `${getApiUrl()}/api/price`
          : '/api/price';
        const res = await fetch(apiUrl);
        const data = await res.json();
        if (data.price && data.price > 0) setZecPrice(data.price);
      } catch { /* Price toggle hidden on failure */ }
    };
    fetchPrice();
  }, []);

  useEffect(() => {
    const fetchPairs = async () => {
      try {
        const url = usePostgresApiClient()
          ? `${getApiUrl()}/api/crosschain/popular-pairs`
          : '/api/crosschain/popular-pairs';
        const res = await fetch(url);
        const json = await res.json();
        if (json.success && json.pairs) setPopularPairs(json.pairs.slice(0, 8));
      } catch { /* Not critical */ }
    };
    fetchPairs();
  }, []);

  useEffect(() => {
    const fetchWrappedZec = async () => {
      try {
        const url = usePostgresApiClient()
          ? `${getApiUrl()}/api/wrapped-zec/supply`
          : '/api/wrapped-zec/supply';
        const res = await fetch(url);
        const json = await res.json();
        if (json.success) setWrappedZec({ assets: json.assets, totalWrapped: json.totalWrapped });
      } catch { /* Not critical */ }
    };
    fetchWrappedZec();
  }, []);

  const fetchHistory = useCallback(async (page: number, direction: SwapFilter) => {
    setHistoryLoading(true);
    try {
      const dirMap: Record<SwapFilter, string> = { all: '', in: 'inflow', out: 'outflow' };
      const dirParam = direction !== 'all' ? `&direction=${dirMap[direction]}` : '';
      const url = usePostgresApiClient()
        ? `${getApiUrl()}/api/crosschain/history?limit=${SWAPS_PER_PAGE}&page=${page}${dirParam}`
        : `/api/crosschain/history?limit=${SWAPS_PER_PAGE}&page=${page}${dirParam}`;
      const res = await fetch(url);
      const json = await res.json();
      if (json.success && json.swaps) {
        const mapped: RecentSwap[] = json.swaps.map((s: any) => {
          const dir = s.direction === 'inflow' ? 'in' : 'out';
          const isIn = dir === 'in';
          return {
            id: s.id, timestamp: s.timestamp,
            fromChain: isIn ? s.sourceChain : 'zec',
            toChain: isIn ? 'zec' : s.destChain,
            fromAmount: s.sourceAmount || 0, fromSymbol: s.sourceToken || '',
            toAmount: s.destAmount || 0, toSymbol: s.destToken || '',
            direction: dir, status: 'completed',
            amountUsd: s.sourceAmountUsd || s.destAmountUsd || 0,
            zecTxid: s.zecTxid || null,
            sourceTxHash: Array.isArray(s.sourceTxHashes) && s.sourceTxHashes.length > 0 ? s.sourceTxHashes[0] : null,
            destTxHash: Array.isArray(s.destTxHashes) && s.destTxHashes.length > 0 ? s.destTxHashes[0] : null,
          };
        });
        if (page === 1) setHistorySwaps(mapped);
        else setHistorySwaps(prev => [...prev, ...mapped]);
        setHistoryTotal(json.total || 0);
      }
    } catch { /* Not critical */ }
    finally { setHistoryLoading(false); }
  }, []);

  useEffect(() => {
    setSwapPage(1);
    fetchHistory(1, swapFilter);
  }, [swapFilter, fetchHistory]);

  const loadMore = () => {
    const next = swapPage + 1;
    setSwapPage(next);
    fetchHistory(next, swapFilter);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cipher-cyan" />
        <p className="text-secondary ml-4 font-mono text-lg">Loading cross-chain data...</p>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="card text-center py-12">
        <h2 className="text-2xl font-bold font-mono text-secondary mb-4">Cross-Chain Data Unavailable</h2>
        <p className="text-muted max-w-lg mx-auto mb-6">{error || 'No cross-chain data available'}</p>
        <Link href="/" className="px-4 py-2 card-bg border border-cipher-border text-secondary rounded-lg hover:border-cipher-cyan transition-colors font-mono text-sm">Back to Explorer</Link>
      </div>
    );
  }

  const fv = (usd: number) => formatValue(usd, unit, zecPrice);

  const totalInflow24h = stats.inflows.reduce((s, g) => s + g.totalVolume24h, 0);
  const totalOutflow24h = stats.outflows.reduce((s, g) => s + g.totalVolume24h, 0);
  const netFlow24h = totalInflow24h - totalOutflow24h;
  const avgSwapSize = stats.totalSwaps24h > 0 ? stats.totalVolume24h / stats.totalSwaps24h : 0;

  const displayedSwaps = historySwaps;
  const hasMore = historySwaps.length < historyTotal;

  const swapColumns: DataTableColumn<RecentSwap>[] = [
    {
      id: 'time', header: 'Time',
      cell: (swap) => <span className="text-xs text-muted font-mono tabular-nums">{formatRelativeTime(swap.timestamp)}</span>,
      className: 'hidden sm:table-cell', skeletonWidth: 'w-14',
    },
    {
      id: 'direction', header: 'Dir',
      cell: (swap) => (
        <Badge color={swap.direction === 'in' ? 'green' : 'orange'} variant="subtle">
          {swap.direction === 'in' ? 'IN' : 'OUT'}
        </Badge>
      ),
      skeletonWidth: 'w-10',
    },
    {
      id: 'from', header: 'From',
      cell: (swap) => (
        <div className="flex items-center gap-2 min-w-0">
          <TokenChainIcon token={swap.fromSymbol} chain={swap.direction === 'in' ? swap.fromChain : 'zec'} size={22} />
          <div className="flex flex-col min-w-0">
            <span className="text-xs font-mono text-primary font-semibold truncate tabular-nums">{formatAmount(swap.fromAmount)} {swap.fromSymbol}</span>
            <span className="text-[10px] text-muted">{swap.direction === 'in' ? (CHAIN_NAMES[swap.fromChain] || swap.fromChain) : 'Zcash'}</span>
          </div>
        </div>
      ),
      skeletonWidth: 'w-28',
    },
    {
      id: 'to', header: 'To',
      cell: (swap) => (
        <div className="flex items-center gap-2 min-w-0">
          <TokenChainIcon token={swap.toSymbol} chain={swap.direction === 'in' ? 'zec' : swap.toChain} size={22} />
          <div className="flex flex-col min-w-0">
            <span className="text-xs font-mono text-primary font-semibold truncate tabular-nums">{formatAmount(swap.toAmount)} {swap.toSymbol}</span>
            <span className="text-[10px] text-muted">{swap.direction === 'in' ? 'Zcash' : (CHAIN_NAMES[swap.toChain] || swap.toChain)}</span>
          </div>
        </div>
      ),
      skeletonWidth: 'w-28',
    },
    {
      id: 'amount', header: unit === 'zec' ? 'ZEC' : 'USD', align: 'right',
      cell: (swap) => swap.amountUsd
        ? <span className="text-xs font-mono text-secondary tabular-nums">{fv(swap.amountUsd)}</span>
        : <span className="text-muted">—</span>,
      skeletonWidth: 'w-12',
    },
    {
      id: 'link', header: '', align: 'right',
      cell: (swap) => {
        const explorerUrl = getSwapExplorerUrl(swap);
        if (!explorerUrl) return null;
        const isInternal = explorerUrl.startsWith('/');
        const icon = (
          <svg className="w-3.5 h-3.5 text-muted hover:text-cipher-cyan transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        );
        return isInternal
          ? <Link href={explorerUrl}>{icon}</Link>
          : <a href={explorerUrl} target="_blank" rel="noopener noreferrer">{icon}</a>;
      },
      skeletonWidth: 'w-4',
    },
  ];

  const unitToggle = zecPrice ? (
    <div className="filter-group">
      <button onClick={() => setUnit('usd')} className={`filter-btn ${unit === 'usd' ? 'filter-btn-active' : ''}`}>USD</button>
      <button onClick={() => setUnit('zec')} className={`filter-btn ${unit === 'zec' ? 'filter-btn-active' : ''}`}>ZEC</button>
    </div>
  ) : null;

  return (
    <>
      {/* Sticky section nav */}
      <PageSectionNav sections={SECTIONS} ariaLabel="Cross-chain sections" actions={unitToggle} />

      {/* ── OVERVIEW ── */}
      <section id="overview" className="space-y-6 scroll-mt-40">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            label="24H VOLUME"
            value={fv(stats.totalVolume24h)}
            accent="default"
            hint={<span className="tabular-nums">All-time: {fv(stats.totalVolumeAllTime)}</span>}
          />
          <MetricCard
            label="24H SWAPS"
            value={stats.totalSwaps24h.toLocaleString()}
            hint={<span className="tabular-nums">All-time: {stats.totalSwapsAllTime.toLocaleString()}</span>}
          />
          <MetricCard
            label="24H NET FLOW"
            value={`${netFlow24h > 0 ? '+' : ''}${fv(netFlow24h)}`}
            accent={netFlow24h >= 0 ? 'green' : 'orange'}
            hint={`${fv(totalInflow24h)} in · ${fv(totalOutflow24h)} out`}
          />
          <MetricCard
            label="AVG SWAP SIZE"
            value={fv(avgSwapSize)}
            hint={stats.uniqueWallets30d ? `${stats.uniqueWallets30d.toLocaleString()} unique wallets (30d)` : undefined}
          />
        </div>

        <VolumeTrendsChart unit={unit} zecPrice={zecPrice} />
      </section>

      {/* ── FLOWS ── */}
      <section id="flows" className="space-y-6 scroll-mt-40 pt-8">
        <ChainFlowTable inflows={stats.inflows} outflows={stats.outflows} unit={unit} zecPrice={zecPrice} />

        <div>
          <SectionHeader
            label="SWAP_FEED"
            live
            actions={
              <div className="filter-group">
                {([
                  { id: 'all' as SwapFilter, label: 'All' },
                  { id: 'in' as SwapFilter, label: 'Inflows' },
                  { id: 'out' as SwapFilter, label: 'Outflows' },
                ]).map(f => (
                  <button
                    key={f.id}
                    onClick={() => setSwapFilter(f.id)}
                    className={`filter-btn ${swapFilter === f.id ? 'filter-btn-active' : ''}`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            }
          />
          <DataTable
            columns={swapColumns}
            rows={displayedSwaps}
            rowKey={(swap) => swap.id}
            loading={historyLoading && displayedSwaps.length === 0}
            skeletonRows={8}
            empty={<div className="text-center py-8"><p className="text-muted text-sm font-mono">No swaps found</p></div>}
            footer={
              <div className="flex items-center justify-between px-4 py-3 border-t border-cipher-border">
                <p className="text-[10px] text-muted font-mono tabular-nums">
                  {historyTotal > 0 ? `${historySwaps.length} of ${historyTotal.toLocaleString()} swaps` : `${stats.totalSwapsAllTime.toLocaleString()} swaps indexed`}
                </p>
                {hasMore && (
                  <button
                    onClick={loadMore}
                    disabled={historyLoading}
                    className="px-4 py-1.5 text-[11px] font-mono text-cipher-cyan border border-cipher-cyan/30 rounded-lg hover:bg-cipher-cyan/10 transition-colors disabled:opacity-40"
                  >
                    {historyLoading ? 'Loading...' : 'Load more'}
                  </button>
                )}
              </div>
            }
          />
        </div>
      </section>

      {/* ── ANALYTICS ── */}
      <section id="analytics" className="space-y-6 scroll-mt-40 pt-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <SwapSizeDistribution unit={unit} zecPrice={zecPrice} />
          <TopPairsList pairs={popularPairs} />
        </div>

        <LatencyComparisonChart inbound={stats.latencyByChain} outbound={stats.latencyOutflows} />
      </section>

      {/* ── ECOSYSTEM ── */}
      <section id="ecosystem" className="scroll-mt-40 pt-8">
        {wrappedZec && wrappedZec.assets.length > 0 ? (
          <WrappedZecTracker assets={wrappedZec.assets} totalWrapped={wrappedZec.totalWrapped} unit={unit} zecPrice={zecPrice} />
        ) : (
          <div className="card text-center py-8">
            <p className="text-muted text-sm font-mono">No wrapped ZEC data available</p>
          </div>
        )}
      </section>

      {/* Footer */}
      <div className="text-center pt-4">
        <p className="text-[10px] text-muted font-mono">
          Powered by{' '}
          <a href="https://near.org/intents" target="_blank" rel="noopener noreferrer" className="text-cipher-cyan hover:underline">NEAR Intents</a>
          {' '}· {stats.totalSwapsAllTime.toLocaleString()} swaps indexed
        </p>
      </div>
    </>
  );
}
