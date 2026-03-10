'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { Tooltip } from '@/components/Tooltip';
import { isMainnet } from '@/lib/config';
import { usePostgresApiClient, getApiUrl } from '@/lib/api-config';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend } from 'recharts';
import { TokenChainIcon } from '@/components/TokenChainIcon';

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

interface TrendDataPoint {
  date: string;
  inflowVolume: number;
  outflowVolume: number;
  inflowCount: number;
  outflowCount: number;
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

type ActiveTab = 'volume' | 'swaps' | 'performance';
type SwapFilter = 'all' | 'in' | 'out';

export default function CrosschainPage() {
  const [stats, setStats] = useState<CrossChainStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasFetchedOnce = useRef(false);
  const [trendData, setTrendData] = useState<TrendDataPoint[]>([]);
  const [trendPeriod, setTrendPeriod] = useState<'7d' | '30d'>('30d');
  const [trendChange, setTrendChange] = useState(0);
  const [activeTab, setActiveTab] = useState<ActiveTab>('volume');
  const [swapFilter, setSwapFilter] = useState<SwapFilter>('all');
  const [swapPage, setSwapPage] = useState(1);
  const [historySwaps, setHistorySwaps] = useState<RecentSwap[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [popularPairs, setPopularPairs] = useState<PopularPair[]>([]);

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
    const fetchTrends = async () => {
      try {
        const apiUrl = usePostgresApiClient()
          ? `${getApiUrl()}/api/crosschain/trends?period=${trendPeriod}&granularity=daily`
          : `/api/crosschain/trends?period=${trendPeriod}&granularity=daily`;
        const res = await fetch(apiUrl);
        const json = await res.json();
        if (json.success && json.data) { setTrendData(json.data); setTrendChange(json.volumeChange || 0); }
      } catch { /* Not critical */ }
    };
    if (isMainnet) fetchTrends();
  }, [trendPeriod]);

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
    if (activeTab === 'swaps') {
      setSwapPage(1);
      fetchHistory(1, swapFilter);
    }
  }, [activeTab, swapFilter, fetchHistory]);

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
        <div className="max-w-7xl mx-auto flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cipher-cyan" />
          <p className="text-secondary ml-4 font-mono text-lg">Loading cross-chain data...</p>
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

  const totalInflows = stats.inflows.reduce((sum, c) => sum + c.totalVolume24h, 0);
  const totalOutflows = stats.outflows.reduce((sum, c) => sum + c.totalVolume24h, 0);
  const displayedSwaps = activeTab === 'swaps' ? historySwaps : stats.recentSwaps;
  const hasMore = historySwaps.length < historyTotal;

  const tabs: { id: ActiveTab; label: string }[] = [
    { id: 'volume', label: 'Volume' },
    { id: 'swaps', label: 'Swaps' },
    { id: 'performance', label: 'Performance' },
  ];

  const renderSwapRow = (swap: RecentSwap) => {
    const isInflow = swap.direction === 'in';
    const explorerUrl = getSwapExplorerUrl(swap);
    const isInternal = explorerUrl?.startsWith('/');

    const row = (
      <div className="grid grid-cols-1 sm:grid-cols-[60px_60px_1fr_30px_1fr_80px] gap-2 items-center p-3 rounded-lg border border-cipher-border hover:border-cipher-cyan/30 transition-all bg-glass-2 hover:bg-glass-3">
        <span className="text-[10px] text-muted font-mono hidden sm:block">{formatRelativeTime(swap.timestamp)}</span>
        <div className="flex items-center gap-2 sm:block">
          {isInflow ? (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-cipher-green/15 text-cipher-green text-[10px] font-bold rounded border border-cipher-green/20">IN</span>
          ) : (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-red-500/15 text-red-400 text-[10px] font-bold rounded border border-red-500/20">OUT</span>
          )}
          <span className="text-[10px] text-muted font-mono sm:hidden">{formatRelativeTime(swap.timestamp)}</span>
        </div>
        <div className="flex items-center gap-2">
          <TokenChainIcon token={swap.fromSymbol} chain={isInflow ? swap.fromChain : 'zec'} size={24} />
          <div className="flex flex-col min-w-0">
            <span className="text-xs font-mono text-primary font-semibold truncate">{formatAmount(swap.fromAmount)} {swap.fromSymbol}</span>
            <span className="text-[10px] text-muted">{isInflow ? (chainNames[swap.fromChain] || swap.fromChain) : 'Zcash'}</span>
          </div>
        </div>
        <div className="hidden sm:flex justify-center"><span className="text-muted text-sm">→</span></div>
        <div className="flex items-center gap-2">
          <TokenChainIcon token={swap.toSymbol} chain={isInflow ? 'zec' : swap.toChain} size={24} />
          <div className="flex flex-col min-w-0">
            <span className="text-xs font-mono text-primary font-semibold truncate">{formatAmount(swap.toAmount)} {swap.toSymbol}</span>
            <span className="text-[10px] text-muted">{isInflow ? 'Zcash' : (chainNames[swap.toChain] || swap.toChain)}</span>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2">
          {swap.amountUsd ? <span className="text-[10px] font-mono text-muted">{formatUSD(swap.amountUsd)}</span> : null}
          {explorerUrl && (
            <svg className="w-3 h-3 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          )}
        </div>
      </div>
    );

    if (explorerUrl) {
      if (isInternal) return <Link key={swap.id} href={explorerUrl} className="block cursor-pointer">{row}</Link>;
      return <a key={swap.id} href={explorerUrl} target="_blank" rel="noopener noreferrer" className="block cursor-pointer">{row}</a>;
    }
    return <div key={swap.id}>{row}</div>;
  };

  return (
    <div className="min-h-screen py-8 sm:py-12 px-4">
      <div className="max-w-7xl mx-auto">

        {/* Header — cypherpunk terminal style */}
        <div className="mb-8 animate-fade-in">
          <p className="text-xs text-muted font-mono uppercase tracking-widest mb-3">
            <span className="opacity-50">{'>'}</span> CROSSCHAIN
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold text-primary">
            ZEC Cross-Chain Analytics
          </h1>
          <div className="flex items-start gap-3 mt-3">
            <div className="w-[2px] h-8 bg-gradient-to-b from-cipher-purple/60 to-cipher-purple/0 shrink-0 mt-0.5" />
            <p className="text-sm text-muted font-mono italic">
              Real-time swap data across 15+ chains via{' '}
              <a href="https://near.org/intents" target="_blank" rel="noopener noreferrer" className="text-cipher-cyan hover:underline">NEAR Intents</a>
            </p>
          </div>
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[
            { label: '24h Volume', value: formatUSD(stats.totalVolume24h), accent: true },
            { label: '24h Swaps', value: stats.totalSwaps24h.toLocaleString() },
            { label: 'All-Time Volume', value: formatUSD(stats.totalVolumeAllTime) },
            { label: 'All-Time Swaps', value: stats.totalSwapsAllTime.toLocaleString() },
          ].map((stat, i) => (
            <div key={stat.label} className="card animate-fade-in-up" style={{ animationDelay: `${i * 50}ms` }}>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-[10px] font-mono text-muted uppercase tracking-wider">{stat.label}</span>
                {i === 0 && <Tooltip content="Total USD value of ZEC swapped in the last 24 hours" />}
              </div>
              <div className={`text-xl sm:text-2xl font-bold font-mono ${stat.accent ? 'text-cipher-cyan' : 'text-primary'}`}>
                {stat.value}
              </div>
            </div>
          ))}
        </div>

        {/* Tab bar */}
        <div className="mb-6 animate-fade-in-up" style={{ animationDelay: '200ms' }}>
          <div className="filter-group inline-flex">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`filter-btn flex items-center gap-2 ${activeTab === tab.id ? 'filter-btn-active' : ''}`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* ═══════════════ VOLUME TAB ═══════════════ */}
        {activeTab === 'volume' && (
          <div className="space-y-6 animate-fade-in">

            {/* Trends chart */}
            {trendData.length > 1 && (
              <div className="card">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted font-mono uppercase tracking-widest opacity-50">{'>'}</span>
                      <h2 className="text-sm font-bold font-mono text-secondary uppercase tracking-wider">VOLUME_TRENDS</h2>
                    </div>
                    {trendChange !== 0 && (
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded ${trendChange > 0 ? 'bg-cipher-green/20 text-cipher-green' : 'bg-red-500/20 text-red-400'}`}>
                        {trendChange > 0 ? '+' : ''}{trendChange.toFixed(1)}%
                      </span>
                    )}
                  </div>
                  <div className="filter-group">
                    {(['7d', '30d'] as const).map(p => (
                      <button key={p} onClick={() => setTrendPeriod(p)} className={`filter-btn ${trendPeriod === p ? 'filter-btn-active' : ''}`}>
                        {p.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={trendData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border, #333)" />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--color-text-muted, #888)' }} tickFormatter={(v: string) => { const d = new Date(v); return `${d.getMonth() + 1}/${d.getDate()}`; }} />
                      <YAxis tick={{ fontSize: 10, fill: 'var(--color-text-muted, #888)' }} tickFormatter={(v: number) => v >= 1000 ? `$${(v / 1000).toFixed(0)}K` : `$${v.toFixed(0)}`} />
                      <RechartsTooltip
                        contentStyle={{ backgroundColor: 'var(--color-surface-solid)', border: '1px solid var(--color-border)', borderRadius: '8px', fontSize: '12px' }}
                        labelStyle={{ color: 'var(--color-text-secondary, #ccc)' }}
                        formatter={(value: number, name: string) => [formatUSD(value), name === 'inflowVolume' ? 'Inflows' : 'Outflows']}
                        labelFormatter={(label: string) => new Date(label).toLocaleDateString()}
                      />
                      <Legend formatter={(value: string) => value === 'inflowVolume' ? 'Inflows' : 'Outflows'} />
                      <Bar dataKey="inflowVolume" fill="#22c55e" radius={[2, 2, 0, 0]} stackId="volume" />
                      <Bar dataKey="outflowVolume" fill="#ef4444" radius={[2, 2, 0, 0]} stackId="volume" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Inflows & Outflows side by side */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Inflows */}
              <div className="card">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted font-mono uppercase tracking-widest opacity-50">{'>'}</span>
                    <h2 className="text-sm font-bold font-mono text-cipher-green uppercase tracking-wider">INFLOWS</h2>
                  </div>
                  <span className="text-xs font-mono text-muted">{formatUSD(totalInflows)} / 24h</span>
                </div>
                <div className="space-y-3">
                  {stats.inflows.length > 0 ? stats.inflows.map((cg) => (
                    <div key={cg.chain} className="group relative">
                      <div className="flex items-center gap-3">
                        <TokenChainIcon token={cg.chain} chain={cg.chain} size={28} />
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-mono font-semibold text-primary">{cg.chainName}</span>
                              {cg.tokens.length > 1 && (
                                <span className="relative cursor-help">
                                  <span className="text-[10px] text-muted hover:text-secondary transition-colors">({cg.tokens.length} tokens)</span>
                                  <span className="absolute bottom-full left-0 mb-2 hidden group-hover:block z-10 bg-cipher-bg border border-cipher-border rounded-lg p-2 shadow-xl min-w-[120px]">
                                    {cg.tokens.map(t => (
                                      <div key={t.symbol} className="flex items-center justify-between gap-4 text-xs py-0.5">
                                        <span className="flex items-center gap-1 text-secondary"><TokenChainIcon token={t.symbol} chain={cg.chain} size={12} />{t.symbol}</span>
                                        <span className="text-primary">{formatUSD(t.volume24h)}</span>
                                      </div>
                                    ))}
                                  </span>
                                </span>
                              )}
                            </div>
                            <span className="text-sm font-mono text-primary">{formatUSD(cg.totalVolume24h)}</span>
                          </div>
                          <div className="h-1.5 progress-bar-bg rounded-full overflow-hidden mt-1">
                            <div className="h-full rounded-full transition-all duration-500" style={{ width: totalInflows > 0 ? `${(cg.totalVolume24h / totalInflows) * 100}%` : '0%', backgroundColor: cg.color }} />
                          </div>
                        </div>
                      </div>
                    </div>
                  )) : <p className="text-muted text-sm">No inflows in the last 24h</p>}
                </div>
              </div>

              {/* Outflows */}
              <div className="card">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted font-mono uppercase tracking-widest opacity-50">{'>'}</span>
                    <h2 className="text-sm font-bold font-mono text-red-400 uppercase tracking-wider">OUTFLOWS</h2>
                  </div>
                  <span className="text-xs font-mono text-muted">{formatUSD(totalOutflows)} / 24h</span>
                </div>
                <div className="space-y-3">
                  {stats.outflows.length > 0 ? stats.outflows.map((cg) => (
                    <div key={cg.chain} className="group relative">
                      <div className="flex items-center gap-3">
                        <TokenChainIcon token={cg.chain} chain={cg.chain} size={28} />
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-mono font-semibold text-primary">{cg.chainName}</span>
                              {cg.tokens.length > 1 && (
                                <span className="relative cursor-help">
                                  <span className="text-[10px] text-muted hover:text-secondary transition-colors">({cg.tokens.length} tokens)</span>
                                  <span className="absolute bottom-full left-0 mb-2 hidden group-hover:block z-10 bg-cipher-bg border border-cipher-border rounded-lg p-2 shadow-xl min-w-[120px]">
                                    {cg.tokens.map(t => (
                                      <div key={t.symbol} className="flex items-center justify-between gap-4 text-xs py-0.5">
                                        <span className="flex items-center gap-1 text-secondary"><TokenChainIcon token={t.symbol} chain={cg.chain} size={12} />{t.symbol}</span>
                                        <span className="text-primary">{formatUSD(t.volume24h)}</span>
                                      </div>
                                    ))}
                                  </span>
                                </span>
                              )}
                            </div>
                            <span className="text-sm font-mono text-primary">{formatUSD(cg.totalVolume24h)}</span>
                          </div>
                          <div className="h-1.5 progress-bar-bg rounded-full overflow-hidden mt-1">
                            <div className="h-full rounded-full transition-all duration-500" style={{ width: totalOutflows > 0 ? `${(cg.totalVolume24h / totalOutflows) * 100}%` : '0%', backgroundColor: cg.color }} />
                          </div>
                        </div>
                      </div>
                    </div>
                  )) : <p className="text-muted text-sm">No outflows in the last 24h</p>}
                </div>
              </div>
            </div>

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
          </div>
        )}

        {/* ═══════════════ SWAPS TAB ═══════════════ */}
        {activeTab === 'swaps' && (
          <div className="animate-fade-in">
            <div className="card">
              <div className="flex items-center justify-between mb-5">
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

              <div className="space-y-1.5">
                {historyLoading && displayedSwaps.length === 0 ? (
                  <>
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className="grid grid-cols-1 sm:grid-cols-[60px_60px_1fr_30px_1fr_80px] gap-2 items-center p-3 rounded-lg border border-cipher-border bg-glass-2 animate-pulse">
                        <div className="h-3 bg-cipher-border rounded w-10 hidden sm:block" />
                        <div className="h-5 bg-cipher-border rounded w-10" />
                        <div className="flex items-center gap-2">
                          <div className="h-6 w-6 bg-cipher-border rounded-full" />
                          <div className="h-3 bg-cipher-border rounded w-20" />
                        </div>
                        <div className="hidden sm:block" />
                        <div className="flex items-center gap-2">
                          <div className="h-6 w-6 bg-cipher-border rounded-full" />
                          <div className="h-3 bg-cipher-border rounded w-20" />
                        </div>
                        <div className="h-3 bg-cipher-border rounded w-12 ml-auto" />
                      </div>
                    ))}
                  </>
                ) : displayedSwaps.length > 0 ? displayedSwaps.map(renderSwapRow) : (
                  <div className="text-center py-8">
                    <p className="text-muted text-sm font-mono">No swaps found</p>
                  </div>
                )}
              </div>

              {/* Load more / footer */}
              <div className="mt-4 pt-4 border-t border-cipher-border">
                <div className="flex items-center justify-between">
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
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════ PERFORMANCE TAB ═══════════════ */}
        {activeTab === 'performance' && (
          <div className="space-y-6 animate-fade-in">

            {/* Info banner */}
            <div className="card">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-cipher-purple/10 border border-cipher-purple/20 flex items-center justify-center shrink-0 mt-0.5">
                  <svg className="w-4 h-4 text-cipher-purple" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm text-primary font-mono font-semibold mb-1">How we measure latency</p>
                  <p className="text-xs text-muted leading-relaxed">
                    Median time between swap initiation and ZEC block confirmation, calculated from matched on-chain transactions. Actual user experience may vary based on network congestion.
                  </p>
                </div>
              </div>
            </div>

            {/* Buy ZEC latency */}
            {stats.latencyByChain.filter(l => l.medianMinutes > 0).length > 0 && (
              <div className="card">
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-xs text-muted font-mono uppercase tracking-widest opacity-50">{'>'}</span>
                  <h2 className="text-sm font-bold font-mono text-cipher-green uppercase tracking-wider">BUY_ZEC_LATENCY</h2>
                  <span className="text-[10px] text-muted ml-2">Time until ZEC arrives</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {stats.latencyByChain.filter(l => l.medianMinutes > 0).map((l) => (
                    <div key={l.chain} className="rounded-lg bg-glass-2 border border-glass-4 p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <TokenChainIcon token={l.chain} chain={l.chain} size={20} />
                        <span className="text-xs font-mono text-secondary">{l.chainName}</span>
                      </div>
                      <div className="text-lg font-bold font-mono text-primary">
                        {l.medianMinutes < 60 ? `${l.medianMinutes.toFixed(0)}m` : `${(l.medianMinutes / 60).toFixed(1)}h`}
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-[10px] text-muted">median</span>
                        <span className="text-[10px] text-muted">{l.swapCount.toLocaleString()} swaps</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Sell ZEC latency */}
            {stats.latencyOutflows.filter(l => l.medianMinutes > 0).length > 0 && (
              <div className="card">
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-xs text-muted font-mono uppercase tracking-widest opacity-50">{'>'}</span>
                  <h2 className="text-sm font-bold font-mono text-red-400 uppercase tracking-wider">SELL_ZEC_LATENCY</h2>
                  <span className="text-[10px] text-muted ml-2">ZEC deposit confirmation time</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {stats.latencyOutflows.filter(l => l.medianMinutes > 0).map((l) => (
                    <div key={l.chain} className="rounded-lg bg-glass-2 border border-glass-4 p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <TokenChainIcon token={l.chain} chain={l.chain} size={20} />
                        <span className="text-xs font-mono text-secondary">{l.chainName}</span>
                      </div>
                      <div className="text-lg font-bold font-mono text-primary">
                        {l.medianMinutes < 60 ? `${l.medianMinutes.toFixed(0)}m` : `${(l.medianMinutes / 60).toFixed(1)}h`}
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-[10px] text-muted">median</span>
                        <span className="text-[10px] text-muted">{l.swapCount.toLocaleString()} swaps</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {stats.latencyByChain.filter(l => l.medianMinutes > 0).length === 0 &&
             stats.latencyOutflows.filter(l => l.medianMinutes > 0).length === 0 && (
              <div className="card text-center py-12">
                <p className="text-muted text-sm font-mono">No latency data available yet.</p>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 text-center animate-fade-in-up" style={{ animationDelay: '300ms' }}>
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
