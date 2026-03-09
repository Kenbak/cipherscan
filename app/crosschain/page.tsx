'use client';

import { useState, useEffect, useRef } from 'react';
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

const chainConfig: Record<string, { color: string; symbol: string; name: string; iconId?: string; needsWhiteBg?: boolean }> = {
  btc: { color: '#F7931A', symbol: 'BTC', name: 'Bitcoin', iconId: 'btc' },
  eth: { color: '#627EEA', symbol: 'ETH', name: 'Ethereum', iconId: 'eth' },
  sol: { color: '#14F195', symbol: 'SOL', name: 'Solana', iconId: 'sol' },
  near: { color: '#00C08B', symbol: 'NEAR', name: 'NEAR', iconId: 'near', needsWhiteBg: true },
  usdc: { color: '#2775CA', symbol: 'USDC', name: 'USDC', iconId: 'usdc' },
  usdt: { color: '#26A17B', symbol: 'USDT', name: 'Tether', iconId: 'usdt' },
  doge: { color: '#C2A633', symbol: 'DOGE', name: 'Dogecoin', iconId: 'doge' },
  xrp: { color: '#23292F', symbol: 'XRP', name: 'Ripple', iconId: 'xrp', needsWhiteBg: true },
  zec: { color: '#F4B728', symbol: 'ZEC', name: 'Zcash', iconId: 'zec' },
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
  // Always prefer CipherScan when we have a ZEC txid
  if (swap.zecTxid) return `/tx/${swap.zecTxid}`;
  // Fallback to external explorer
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

export default function CrosschainPage() {
  const [stats, setStats] = useState<CrossChainStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasFetchedOnce = useRef(false);
  const [trendData, setTrendData] = useState<TrendDataPoint[]>([]);
  const [trendPeriod, setTrendPeriod] = useState<'7d' | '30d'>('30d');
  const [trendChange, setTrendChange] = useState(0);

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

        if (!data.success) {
          setError(data.error || 'Failed to fetch data');
          return;
        }

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
            id: swap.id,
            timestamp: swap.timestamp,
            fromChain: swap.fromChain,
            fromAmount: swap.fromAmount,
            fromSymbol: swap.fromSymbol,
            toChain: swap.toChain,
            toSymbol: swap.toSymbol,
            toAmount: swap.toAmount,
            amountUsd: swap.amountUsd,
            direction: swap.direction,
            status: swap.status,
            zecTxid: swap.zecTxid,
            sourceTxHash: swap.sourceTxHash,
            destTxHash: swap.destTxHash,
          })),
          latencyByChain: data.latencyByChain || [],
          latencyOutflows: data.latencyOutflows || [],
        };

        setStats(transformedStats);
        hasFetchedOnce.current = true;
      } catch (err) {
        console.error('Error fetching cross-chain stats:', err);
        setError('Failed to connect to API');
      } finally {
        setLoading(false);
      }
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
        if (json.success && json.data) {
          setTrendData(json.data);
          setTrendChange(json.volumeChange || 0);
        }
      } catch {
        // Not critical
      }
    };
    if (isMainnet) fetchTrends();
  }, [trendPeriod]);

  if (!isMainnet) {
    return (
      <div className="min-h-screen py-8 sm:py-12 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="card text-center py-12">
            <h1 className="text-2xl font-bold font-mono text-secondary mb-4">
              Cross-Chain Available on Mainnet Only
            </h1>
            <p className="text-muted max-w-lg mx-auto mb-6">
              NEAR Intents cross-chain swaps are only available for ZEC mainnet.
            </p>
            <div className="flex justify-center gap-4">
              <a
                href="https://cipherscan.app/crosschain"
                className="px-4 py-2 bg-cipher-green/20 border border-cipher-green text-cipher-green rounded-lg hover:bg-cipher-green/30 transition-colors font-mono text-sm"
              >
                View on Mainnet
              </a>
              <Link
                href="/"
                className="px-4 py-2 bg-cipher-surface/30 border border-cipher-border text-secondary rounded-lg hover:border-cipher-cyan transition-colors font-mono text-sm"
              >
                Back to Explorer
              </Link>
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
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cipher-cyan"></div>
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
            <h1 className="text-2xl font-bold font-mono text-secondary mb-4">
              Cross-Chain Data Unavailable
            </h1>
            <p className="text-muted max-w-lg mx-auto mb-6">
              {error || 'No cross-chain data available'}
            </p>
            <Link
              href="/"
              className="px-4 py-2 card-bg border border-cipher-border text-secondary rounded-lg hover:border-cipher-cyan transition-colors font-mono text-sm"
            >
              Back to Explorer
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const totalInflows = stats.inflows.reduce((sum, c) => sum + c.totalVolume24h, 0);
  const totalOutflows = stats.outflows.reduce((sum, c) => sum + c.totalVolume24h, 0);

  return (
    <div className="min-h-screen py-8 sm:py-12 px-4">
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-cipher-cyan/10 border border-cipher-cyan/20 flex items-center justify-center">
              <svg className="w-5 h-5 text-cipher-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold font-mono text-foreground">Crosschain</h1>
              <p className="text-xs text-muted font-mono mt-0.5">
                ZEC cross-chain swaps via{' '}
                <a href="https://near.org/intents" target="_blank" rel="noopener noreferrer" className="text-cipher-cyan hover:underline">
                  NEAR Intents
                </a>
              </p>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="card">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[10px] font-mono text-muted uppercase tracking-wider">24h Volume</span>
              <Tooltip content="Total USD value of ZEC swapped in the last 24 hours" />
            </div>
            <div className="text-xl sm:text-2xl font-bold font-mono text-cipher-cyan">
              {formatUSD(stats.totalVolume24h)}
            </div>
          </div>

          <div className="card">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[10px] font-mono text-muted uppercase tracking-wider">24h Swaps</span>
            </div>
            <div className="text-xl sm:text-2xl font-bold font-mono text-foreground">
              {stats.totalSwaps24h.toLocaleString()}
            </div>
          </div>

          <div className="card">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[10px] font-mono text-muted uppercase tracking-wider">All-Time Volume</span>
            </div>
            <div className="text-xl sm:text-2xl font-bold font-mono text-foreground">
              {formatUSD(stats.totalVolumeAllTime)}
            </div>
          </div>

          <div className="card">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[10px] font-mono text-muted uppercase tracking-wider">All-Time Swaps</span>
            </div>
            <div className="text-xl sm:text-2xl font-bold font-mono text-foreground">
              {stats.totalSwapsAllTime.toLocaleString()}
            </div>
          </div>
        </div>

        {/* Volume Trends Chart */}
        {trendData.length > 1 && (
          <div className="card mb-8">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <h2 className="text-base font-bold font-mono text-foreground">Volume Trends</h2>
                {trendChange !== 0 && (
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded ${trendChange > 0 ? 'bg-cipher-green/20 text-cipher-green' : 'bg-red-500/20 text-red-400'}`}>
                    {trendChange > 0 ? '+' : ''}{trendChange.toFixed(1)}%
                  </span>
                )}
              </div>
              <div className="flex gap-1">
                {(['7d', '30d'] as const).map(p => (
                  <button
                    key={p}
                    onClick={() => setTrendPeriod(p)}
                    className={`px-3 py-1 text-[10px] font-mono rounded transition-colors ${
                      trendPeriod === p
                        ? 'bg-cipher-cyan/20 text-cipher-cyan border border-cipher-cyan/30'
                        : 'text-muted hover:text-secondary border border-cipher-border'
                    }`}
                  >
                    {p.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trendData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border, #333)" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10, fill: 'var(--color-muted, #888)' }}
                    tickFormatter={(v: string) => {
                      const d = new Date(v);
                      return `${d.getMonth() + 1}/${d.getDate()}`;
                    }}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: 'var(--color-muted, #888)' }}
                    tickFormatter={(v: number) => v >= 1000 ? `$${(v/1000).toFixed(0)}K` : `$${v.toFixed(0)}`}
                  />
                  <RechartsTooltip
                    contentStyle={{ backgroundColor: 'var(--color-card-bg, #1a1a2e)', border: '1px solid var(--color-border, #333)', borderRadius: '8px', fontSize: '12px' }}
                    labelStyle={{ color: 'var(--color-secondary, #ccc)' }}
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

        {/* Swap Latency */}
        {(stats.latencyByChain.length > 0 || stats.latencyOutflows.length > 0) && (
          <div className="card mb-8">
            <div className="flex items-center gap-2 mb-5">
              <h2 className="text-base font-bold font-mono text-foreground">Swap Latency</h2>
              <Tooltip content="Median time from swap initiation to ZEC block confirmation, measured from matched on-chain swaps" />
            </div>

            {/* Inflows: Time to receive ZEC */}
            {stats.latencyByChain.filter(l => l.medianMinutes > 0).length > 0 && (
              <>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-[10px] font-mono text-cipher-green uppercase tracking-wider">Buy ZEC (Inflows)</span>
                  <span className="text-[10px] text-muted">— time until ZEC arrives</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-5">
                  {stats.latencyByChain.filter(l => l.medianMinutes > 0).map((l) => (
                    <div key={l.chain} className="rounded-lg bg-white/[0.02] border border-white/[0.04] p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <TokenChainIcon token={l.chain} chain={l.chain} size={20} />
                        <span className="text-xs font-mono text-secondary">{l.chainName}</span>
                      </div>
                      <div className="text-lg font-bold font-mono text-foreground">
                        {l.medianMinutes < 60
                          ? `${l.medianMinutes.toFixed(0)}m`
                          : `${(l.medianMinutes / 60).toFixed(1)}h`
                        }
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-[10px] text-muted">median</span>
                        <span className="text-[10px] text-muted">{l.swapCount.toLocaleString()} swaps</span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Outflows: ZEC deposit confirmation */}
            {stats.latencyOutflows.filter(l => l.medianMinutes > 0).length > 0 && (
              <>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-[10px] font-mono text-red-400 uppercase tracking-wider">Sell ZEC (Outflows)</span>
                  <span className="text-[10px] text-muted">— ZEC deposit confirmation time</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {stats.latencyOutflows.filter(l => l.medianMinutes > 0).map((l) => (
                    <div key={l.chain} className="rounded-lg bg-white/[0.02] border border-white/[0.04] p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <TokenChainIcon token={l.chain} chain={l.chain} size={20} />
                        <span className="text-xs font-mono text-secondary">{l.chainName}</span>
                      </div>
                      <div className="text-lg font-bold font-mono text-foreground">
                        {l.medianMinutes < 60
                          ? `${l.medianMinutes.toFixed(0)}m`
                          : `${(l.medianMinutes / 60).toFixed(1)}h`
                        }
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-[10px] text-muted">median</span>
                        <span className="text-[10px] text-muted">{l.swapCount.toLocaleString()} swaps</span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Inflows & Outflows */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Inflows */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold font-mono text-cipher-green flex items-center gap-2">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                </svg>
                Inflows → ZEC
              </h2>
              <span className="text-xs font-mono text-muted">{formatUSD(totalInflows)} / 24h</span>
            </div>
            <div className="space-y-3">
              {stats.inflows.length > 0 ? stats.inflows.map((chainGroup) => (
                <div key={chainGroup.chain} className="group relative">
                  <div className="flex items-center gap-3">
                    <TokenChainIcon token={chainGroup.chain} chain={chainGroup.chain} size={28} />
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-mono font-semibold text-foreground">{chainGroup.chainName}</span>
                          {chainGroup.tokens.length > 1 && (
                            <span className="relative cursor-help">
                              <span className="text-[10px] text-muted hover:text-secondary transition-colors">
                                ({chainGroup.tokens.length} tokens)
                              </span>
                              <span className="absolute bottom-full left-0 mb-2 hidden group-hover:block z-10 bg-cipher-bg border border-cipher-border rounded-lg p-2 shadow-xl min-w-[120px]">
                                {chainGroup.tokens.map((token) => (
                                  <div key={token.symbol} className="flex items-center justify-between gap-4 text-xs py-0.5">
                                    <span className="flex items-center gap-1 text-secondary">
                                      <TokenChainIcon token={token.symbol} chain={chainGroup.chain} size={12} />
                                      {token.symbol}
                                    </span>
                                    <span className="text-foreground">{formatUSD(token.volume24h)}</span>
                                  </div>
                                ))}
                              </span>
                            </span>
                          )}
                        </div>
                        <span className="text-sm font-mono text-foreground">{formatUSD(chainGroup.totalVolume24h)}</span>
                      </div>
                      <div className="h-1.5 progress-bar-bg rounded-full overflow-hidden mt-1">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: totalInflows > 0 ? `${(chainGroup.totalVolume24h / totalInflows) * 100}%` : '0%',
                            backgroundColor: chainGroup.color
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )) : (
                <p className="text-muted text-sm">No inflows in the last 24h</p>
              )}
            </div>
          </div>

          {/* Outflows */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold font-mono text-red-400 flex items-center gap-2">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                </svg>
                Outflows ZEC →
              </h2>
              <span className="text-xs font-mono text-muted">{formatUSD(totalOutflows)} / 24h</span>
            </div>
            <div className="space-y-3">
              {stats.outflows.length > 0 ? stats.outflows.map((chainGroup) => (
                <div key={chainGroup.chain} className="group relative">
                  <div className="flex items-center gap-3">
                    <TokenChainIcon token={chainGroup.chain} chain={chainGroup.chain} size={28} />
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-mono font-semibold text-foreground">{chainGroup.chainName}</span>
                          {chainGroup.tokens.length > 1 && (
                            <span className="relative cursor-help">
                              <span className="text-[10px] text-muted hover:text-secondary transition-colors">
                                ({chainGroup.tokens.length} tokens)
                              </span>
                              <span className="absolute bottom-full left-0 mb-2 hidden group-hover:block z-10 bg-cipher-bg border border-cipher-border rounded-lg p-2 shadow-xl min-w-[120px]">
                                {chainGroup.tokens.map((token) => (
                                  <div key={token.symbol} className="flex items-center justify-between gap-4 text-xs py-0.5">
                                    <span className="flex items-center gap-1 text-secondary">
                                      <TokenChainIcon token={token.symbol} chain={chainGroup.chain} size={12} />
                                      {token.symbol}
                                    </span>
                                    <span className="text-foreground">{formatUSD(token.volume24h)}</span>
                                  </div>
                                ))}
                              </span>
                            </span>
                          )}
                        </div>
                        <span className="text-sm font-mono text-foreground">{formatUSD(chainGroup.totalVolume24h)}</span>
                      </div>
                      <div className="h-1.5 progress-bar-bg rounded-full overflow-hidden mt-1">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: totalOutflows > 0 ? `${(chainGroup.totalVolume24h / totalOutflows) * 100}%` : '0%',
                            backgroundColor: chainGroup.color
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )) : (
                <p className="text-muted text-sm">No outflows in the last 24h</p>
              )}
            </div>
          </div>
        </div>

        {/* Recent Swaps */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold font-mono text-foreground">Recent Swaps</h2>
            <span className="flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
              </span>
              <span className="text-[10px] font-mono text-muted">LIVE</span>
            </span>
          </div>

          <div className="space-y-1.5">
            {stats.recentSwaps.map((swap) => {
              const isInflow = swap.direction === 'in';
              const explorerUrl = getSwapExplorerUrl(swap);
              const isInternal = explorerUrl?.startsWith('/');

              const rowContent = (
                <div className="grid grid-cols-1 sm:grid-cols-[60px_60px_1fr_30px_1fr_80px] gap-2 items-center p-3 rounded-lg border border-cipher-border hover:border-cipher-cyan/30 transition-all bg-white/[0.01] hover:bg-white/[0.03]">
                  {/* Time */}
                  <span className="text-[10px] text-muted font-mono hidden sm:block">
                    {formatRelativeTime(swap.timestamp)}
                  </span>

                  {/* Direction */}
                  <div className="flex items-center gap-2 sm:block">
                    {isInflow ? (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-cipher-green/15 text-cipher-green text-[10px] font-bold rounded border border-cipher-green/20">
                        IN
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-red-500/15 text-red-400 text-[10px] font-bold rounded border border-red-500/20">
                        OUT
                      </span>
                    )}
                    <span className="text-[10px] text-muted font-mono sm:hidden">
                      {formatRelativeTime(swap.timestamp)}
                    </span>
                  </div>

                  {/* Source */}
                  <div className="flex items-center gap-2">
                    <TokenChainIcon
                      token={swap.fromSymbol}
                      chain={isInflow ? swap.fromChain : 'zec'}
                      size={24}
                    />
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs font-mono text-foreground font-semibold truncate">
                        {formatAmount(swap.fromAmount)} {swap.fromSymbol}
                      </span>
                      <span className="text-[10px] text-muted">
                        {isInflow ? (chainNames[swap.fromChain] || swap.fromChain) : 'Zcash'}
                      </span>
                    </div>
                  </div>

                  {/* Arrow */}
                  <div className="hidden sm:flex justify-center">
                    <span className="text-muted text-sm">→</span>
                  </div>

                  {/* Destination */}
                  <div className="flex items-center gap-2">
                    <TokenChainIcon
                      token={swap.toSymbol}
                      chain={isInflow ? 'zec' : swap.toChain}
                      size={24}
                    />
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs font-mono text-foreground font-semibold truncate">
                        {formatAmount(swap.toAmount)} {swap.toSymbol}
                      </span>
                      <span className="text-[10px] text-muted">
                        {isInflow ? 'Zcash' : (chainNames[swap.toChain] || swap.toChain)}
                      </span>
                    </div>
                  </div>

                  {/* USD + Explorer */}
                  <div className="flex items-center justify-end gap-2">
                    {swap.amountUsd ? (
                      <span className="text-[10px] font-mono text-muted">{formatUSD(swap.amountUsd)}</span>
                    ) : null}
                    {explorerUrl && (
                      <svg className="w-3 h-3 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    )}
                  </div>
                </div>
              );

              if (explorerUrl) {
                if (isInternal) {
                  return (
                    <Link key={swap.id} href={explorerUrl} className="block cursor-pointer">
                      {rowContent}
                    </Link>
                  );
                }
                return (
                  <a key={swap.id} href={explorerUrl} target="_blank" rel="noopener noreferrer" className="block cursor-pointer">
                    {rowContent}
                  </a>
                );
              }

              return <div key={swap.id}>{rowContent}</div>;
            })}
          </div>

          <div className="mt-4 pt-4 border-t border-cipher-border text-center">
            <p className="text-[10px] text-muted font-mono">
              Powered by{' '}
              <a href="https://near.org/intents" target="_blank" rel="noopener noreferrer" className="text-cipher-cyan hover:underline">
                NEAR Intents
              </a>
              {' '}· {stats.totalSwapsAllTime.toLocaleString()} swaps indexed
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}
