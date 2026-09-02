'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/ui/SectionHeader';
import { MetricCard } from '@/components/ui/MetricCard';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { Badge } from '@/components/ui/Badge';
import { isMainnet } from '@/lib/config';
import { usePostgresApiClient, getApiUrl } from '@/lib/api-config';
import { TokenChainIcon } from '@/components/TokenChainIcon';
import { WrappedZecTracker, type WrappedZecAsset } from '@/components/crosschain/WrappedZecTracker';
import { VolumeTrendsChart } from '@/components/crosschain/VolumeTrendsChart';
import { ChainFlowTable } from '@/components/crosschain/ChainFlowTable';
import { LatencyComparisonChart } from '@/components/crosschain/LatencyComparisonChart';

interface TokenVolume {
  symbol: string;
  volume24h: number;
}

interface ChainGroup {
  chain: string;
  chainName: string;
  color: string;
  totalVolume24h: number;
  tokens: TokenVolume[];
}

interface RecentSwap {
  id: string;
  timestamp: number;
  fromChain: string;
  toChain: string;
  fromAmount: number;
  fromSymbol: string;
  toAmount: number;
  toSymbol: string;
  direction: 'in' | 'out';
  status: string;
  amountUsd?: number;
  zecTxid?: string;
  sourceTxHash?: string;
  destTxHash?: string;
}

interface LatencyStat {
  chain: string;
  chainName: string;
  avgMinutes: number;
  medianMinutes: number;
  swapCount: number;
}

interface CrossChainStats {
  totalVolume24h: number;
  totalSwaps24h: number;
  totalSwapsAllTime: number;
  totalVolumeAllTime: number;
  inflows: ChainGroup[];
  outflows: ChainGroup[];
  recentSwaps: RecentSwap[];
  latencyByChain: LatencyStat[];
  latencyOutflows: LatencyStat[];
}

interface PopularPair {
  chain: string;
  token: string;
  swapCount: number;
}

const chainConfig: Record<string, { color: string; symbol: string; name: string; iconId?: string; needsWhiteBg?: boolean }> = {
  btc: { color: '#F7931A', symbol: 'BTC', name: 'Bitcoin', iconId: 'btc' },
  eth: { color: '#627EEA', symbol: 'ETH', name: 'Ethereum', iconId: 'eth' },
  sol: { color: '#14F195', symbol: 'SOL', name: 'Solana', iconId: 'sol' },
  near: { color: '#00C08B', symbol: 'NEAR', name: 'NEAR', iconId: 'near', needsWhiteBg: true },
  usdc: { color: '#2775CA', symbol: 'USDC', name: 'USDC', iconId: 'usdc' },
  usdt: { color: '#26A17B', symbol: 'USDT', name: 'Tether', iconId: 'usdt' },
  doge: { color: '#C2A633', symbol: 'DOGE', name: 'Dogecoin', iconId: 'doge' },
  xrp: { color: '#23292F', symbol: 'XRP', name: 'Ripple', iconId: 'xrp', needsWhiteBg: true },
  zec: { color: 'var(--color-yellow)', symbol: 'ZEC', name: 'Zcash', iconId: 'zec' },
  base: { color: '#0052FF', symbol: 'BASE', name: 'Base', iconId: 'base' },
  arb: { color: '#28A0F0', symbol: 'ARB', name: 'Arbitrum', iconId: 'arb' },
  pol: { color: '#8247E5', symbol: 'POL', name: 'Polygon', iconId: 'matic' },
  avax: { color: '#E84142', symbol: 'AVAX', name: 'Avalanche', iconId: 'avax' },
  trx: { color: '#FF0013', symbol: 'TRX', name: 'Tron', iconId: 'trx' },
  apt: { color: '#000000', symbol: 'APT', name: 'Aptos', iconId: 'apt', needsWhiteBg: true },
  sui: { color: '#6FBCF0', symbol: 'SUI', name: 'Sui', iconId: 'sui' },
  ton: { color: '#0098EA', symbol: 'TON', name: 'TON', iconId: 'ton' },
  bnb: { color: '#F3BA2F', symbol: 'BNB', name: 'BNB Chain', iconId: 'bnb' },
  op: { color: '#FF0420', symbol: 'OP', name: 'Optimism', iconId: 'op' },
  ltc: { color: '#B5B5B5', symbol: 'LTC', name: 'Litecoin', iconId: 'ltc' },
  other: { color: '#6B7280', symbol: '?', name: 'Other', iconId: 'other' },
  unknown: { color: '#6B7280', symbol: '?', name: 'Unknown', iconId: 'other' },
};

const chainNames: Record<string, string> = Object.fromEntries(
  Object.entries(chainConfig).map(([k, v]) => [k, v.name])
);

const CHAIN_EXPLORERS: Record<string, string> = {
  eth: 'https://etherscan.io/tx/',
  sol: 'https://solscan.io/tx/',
  btc: 'https://mempool.space/tx/',
  base: 'https://basescan.org/tx/',
  arb: 'https://arbiscan.io/tx/',
  pol: 'https://polygonscan.com/tx/',
  avax: 'https://snowscan.xyz/tx/',
  trx: 'https://tronscan.org/#/transaction/',
  near: 'https://nearblocks.io/txns/',
  bnb: 'https://bscscan.com/tx/',
  op: 'https://optimistic.etherscan.io/tx/',
  doge: 'https://dogechain.info/tx/',
  xrp: 'https://xrpscan.com/tx/',
  ltc: 'https://blockchair.com/litecoin/transaction/',
  ton: 'https://tonscan.org/tx/',
  apt: 'https://aptoscan.com/transaction/',
  sui: 'https://suiscan.xyz/mainnet/tx/',
};

function formatUSD(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(2)}`;
}

function formatRelativeTime(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function formatAmount(amount: number): string {
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(2)}M`;
  if (amount >= 10_000) return `${(amount / 1_000).toFixed(1)}K`;
  if (amount >= 100) return amount.toFixed(2);
  if (amount >= 1) return amount.toFixed(4);
  return amount.toFixed(6);
}

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

type SwapFilter = 'all' | 'in' | 'out';

export default function CrosschainPage() {
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

  const SWAPS_PER_PAGE = 15;

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

        const transformedStats: CrossChainStats = {
          totalVolume24h: data.totalVolume24h || 0,
          totalSwaps24h: data.totalSwaps24h || 0,
          totalSwapsAllTime: data.totalSwapsAllTime || 0,
          totalVolumeAllTime: data.totalVolumeAllTime || 0,
          inflows: (data.inflows || []).map((c: any) => ({
            chain: c.chain,
            chainName: chainNames[c.chain] || c.chainName || c.chain,
            color: chainConfig[c.chain]?.color || '#666',
            totalVolume24h: c.totalVolume24h || c.volumeUsd || 0,
            tokens: c.tokens || [],
          })),
          outflows: (data.outflows || []).map((c: any) => ({
            chain: c.chain,
            chainName: chainNames[c.chain] || c.chainName || c.chain,
            color: chainConfig[c.chain]?.color || '#666',
            totalVolume24h: c.totalVolume24h || c.volumeUsd || 0,
            tokens: c.tokens || [],
          })),
          recentSwaps: (data.recentSwaps || []).map((swap: any) => ({
            id: swap.id, timestamp: swap.timestamp, fromChain: swap.fromChain,
            fromAmount: swap.fromAmount, fromSymbol: swap.fromSymbol,
            toChain: swap.toChain, toSymbol: swap.toSymbol, toAmount: swap.toAmount,
            amountUsd: swap.amountUsd, direction: swap.direction, status: swap.status,
            zecTxid: swap.zecTxid, sourceTxHash: swap.sourceTxHash, destTxHash: swap.destTxHash,
          })),
          latencyByChain: data.latencyByChain || [],
          latencyOutflows: data.latencyOutflows || [],
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
    const fetchPairs = async () => {
      try {
        const url = usePostgresApiClient()
          ? `${getApiUrl()}/api/crosschain/popular-pairs`
          : '/api/crosschain/popular-pairs';
        const res = await fetch(url);
        const json = await res.json();
        if (json.success && json.pairs) setPopularPairs(json.pairs.slice(0, 6));
      } catch { /* Not critical */ }
    };
    if (isMainnet) fetchPairs();
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
    if (isMainnet) fetchWrappedZec();
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
            id: s.id,
            timestamp: s.timestamp,
            fromChain: isIn ? s.sourceChain : 'zec',
            toChain: isIn ? 'zec' : s.destChain,
            fromAmount: s.sourceAmount || 0,
            fromSymbol: s.sourceToken || '',
            toAmount: s.destAmount || 0,
            toSymbol: s.destToken || '',
            direction: dir,
            status: 'completed',
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

  if (!isMainnet) {
    return (
      <div className="min-h-screen py-8 sm:py-12 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="card text-center py-12">
            <h1 className="text-2xl font-bold font-mono text-secondary mb-4">Cross-Chain Available on Mainnet Only</h1>
            <p className="text-muted max-w-lg mx-auto mb-6">NEAR Intents cross-chain swaps are only available for ZEC mainnet.</p>
            <div className="flex justify-center gap-4">
              <a href="https://cipherscan.app/crosschain" className="px-4 py-2 bg-cipher-green/20 border border-cipher-green text-cipher-green rounded-lg hover:bg-cipher-green/30 transition-colors font-mono text-sm">View on Mainnet</a>
              <Link href="/" className="px-4 py-2 bg-cipher-surface/30 border border-cipher-border text-secondary rounded-lg hover:border-cipher-cyan transition-colors font-mono text-sm">Back to Explorer</Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen py-8 sm:py-12 px-4">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-2xl sm:text-3xl font-bold text-primary">
            ZEC Cross-Chain Analytics
          </h1>
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cipher-cyan" />
            <p className="text-secondary ml-4 font-mono text-lg">Loading cross-chain data...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="min-h-screen py-8 sm:py-12 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="card text-center py-12">
            <h1 className="text-2xl font-bold font-mono text-secondary mb-4">Cross-Chain Data Unavailable</h1>
            <p className="text-muted max-w-lg mx-auto mb-6">{error || 'No cross-chain data available'}</p>
            <Link href="/" className="px-4 py-2 card-bg border border-cipher-border text-secondary rounded-lg hover:border-cipher-cyan transition-colors font-mono text-sm">Back to Explorer</Link>
          </div>
        </div>
      </div>
    );
  }

  const displayedSwaps = historySwaps;
  const hasMore = historySwaps.length < historyTotal;

  const swapColumns: DataTableColumn<RecentSwap>[] = [
    {
      id: 'time',
      header: 'Time',
      cell: (swap) => <span className="text-xs text-muted font-mono">{formatRelativeTime(swap.timestamp)}</span>,
      className: 'hidden sm:table-cell',
      skeletonWidth: 'w-14',
    },
    {
      id: 'direction',
      header: 'Dir',
      cell: (swap) => (
        <Badge color={swap.direction === 'in' ? 'green' : 'danger'} variant="subtle">
          {swap.direction === 'in' ? 'IN' : 'OUT'}
        </Badge>
      ),
      skeletonWidth: 'w-10',
    },
    {
      id: 'from',
      header: 'From',
      cell: (swap) => (
        <div className="flex items-center gap-2 min-w-0">
          <TokenChainIcon token={swap.fromSymbol} chain={swap.direction === 'in' ? swap.fromChain : 'zec'} size={22} />
          <div className="flex flex-col min-w-0">
            <span className="text-xs font-mono text-primary font-semibold truncate">{formatAmount(swap.fromAmount)} {swap.fromSymbol}</span>
            <span className="text-[10px] text-muted">{swap.direction === 'in' ? (chainNames[swap.fromChain] || swap.fromChain) : 'Zcash'}</span>
          </div>
        </div>
      ),
      skeletonWidth: 'w-28',
    },
    {
      id: 'to',
      header: 'To',
      cell: (swap) => (
        <div className="flex items-center gap-2 min-w-0">
          <TokenChainIcon token={swap.toSymbol} chain={swap.direction === 'in' ? 'zec' : swap.toChain} size={22} />
          <div className="flex flex-col min-w-0">
            <span className="text-xs font-mono text-primary font-semibold truncate">{formatAmount(swap.toAmount)} {swap.toSymbol}</span>
            <span className="text-[10px] text-muted">{swap.direction === 'in' ? 'Zcash' : (chainNames[swap.toChain] || swap.toChain)}</span>
          </div>
        </div>
      ),
      skeletonWidth: 'w-28',
    },
    {
      id: 'amount',
      header: 'USD',
      align: 'right',
      cell: (swap) => swap.amountUsd ? <span className="text-xs font-mono text-secondary">{formatUSD(swap.amountUsd)}</span> : <span className="text-muted">—</span>,
      skeletonWidth: 'w-12',
    },
    {
      id: 'link',
      header: '',
      align: 'right',
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

  return (
    <div className="min-h-screen py-8 sm:py-12 px-4">
      <div className="max-w-7xl mx-auto space-y-6">

        <PageHeader eyebrow="CROSSCHAIN" title="ZEC Cross-Chain Analytics">
          <div className="flex items-start gap-3 mt-3">
            <div className="w-[2px] h-8 bg-gradient-to-b from-cipher-purple/60 to-cipher-purple/0 shrink-0 mt-0.5" />
            <p className="text-sm text-muted font-mono italic">
              Real-time swap data across 15+ chains via{' '}
              <a href="https://near.org/intents" target="_blank" rel="noopener noreferrer" className="text-cipher-cyan hover:underline">NEAR Intents</a>
            </p>
          </div>
          <a
            href="https://cipherswap.app/"
            target="_blank"
            rel="noopener"
            className="inline-flex mt-3 text-sm font-mono text-cipher-yellow hover:underline"
          >
            Buy ZEC on CipherSwap, CipherScan&apos;s sister site →
          </a>
        </PageHeader>

        {/* Hero stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard label="24H VOLUME" value={formatUSD(stats.totalVolume24h)} accent="cyan" />
          <MetricCard label="24H SWAPS" value={stats.totalSwaps24h.toLocaleString()} />
          <MetricCard label="ALL-TIME VOLUME" value={formatUSD(stats.totalVolumeAllTime)} />
          <MetricCard label="ALL-TIME SWAPS" value={stats.totalSwapsAllTime.toLocaleString()} />
        </div>

        {/* Wrapped ZEC tracker */}
        {wrappedZec && wrappedZec.assets.length > 0 && (
          <WrappedZecTracker assets={wrappedZec.assets} totalWrapped={wrappedZec.totalWrapped} />
        )}

        {/* Volume trends */}
        <VolumeTrendsChart />

        {/* Per-chain, per-token flow detail */}
        <ChainFlowTable inflows={stats.inflows} outflows={stats.outflows} />

        {/* Top pairs */}
        {popularPairs.length > 0 && (
          <div className="card">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-xs text-muted font-mono uppercase tracking-widest opacity-50">{'>'}</span>
              <h2 className="text-sm font-bold font-mono text-secondary uppercase tracking-wider">TOP_PAIRS</h2>
              <span className="text-[10px] text-muted font-mono ml-auto">30d swap count</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {popularPairs.map((pair, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-glass-6 bg-glass-2">
                  <TokenChainIcon token={pair.token} chain={pair.chain} size={20} />
                  <span className="text-xs font-mono font-semibold text-primary">{pair.token}</span>
                  <span className="text-[10px] font-mono text-muted">{chainNames[pair.chain] || pair.chain}</span>
                  <span className="text-[10px] font-mono text-cipher-purple ml-1">{pair.swapCount.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Swap feed */}
        <div>
          <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted font-mono uppercase tracking-widest opacity-50">{'>'}</span>
                <h2 className="text-sm font-bold font-mono text-secondary uppercase tracking-wider">SWAP_FEED</h2>
              </div>
              <span className="flex items-center gap-1.5">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                </span>
                <span className="text-[10px] font-mono text-muted">LIVE</span>
              </span>
            </div>
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
          </div>

          <DataTable
            columns={swapColumns}
            rows={displayedSwaps}
            rowKey={(swap) => swap.id}
            loading={historyLoading && displayedSwaps.length === 0}
            skeletonRows={8}
            empty={<div className="text-center py-8"><p className="text-muted text-sm font-mono">No swaps found</p></div>}
            footer={
              <div className="flex items-center justify-between px-4 py-3 border-t border-cipher-border">
                <p className="text-[10px] text-muted font-mono">
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

        {/* Performance / latency */}
        <LatencyComparisonChart inbound={stats.latencyByChain} outbound={stats.latencyOutflows} />

        {/* Footer */}
        <div className="text-center pt-2">
          <p className="text-[10px] text-muted font-mono">
            Powered by{' '}
            <a href="https://near.org/intents" target="_blank" rel="noopener noreferrer" className="text-cipher-cyan hover:underline">NEAR Intents</a>
            {' '}· {stats.totalSwapsAllTime.toLocaleString()} swaps indexed
          </p>
        </div>

      </div>
    </div>
  );
}
