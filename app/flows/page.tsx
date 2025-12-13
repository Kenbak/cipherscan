'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { Tooltip } from '@/components/Tooltip';
import { CURRENCY, isMainnet } from '@/lib/config';
import { usePostgresApiClient, getApiUrl } from '@/lib/api-config';

// Types
interface TokenVolume {
  symbol: string;
  volume24h: number;
}

interface ChainGroup {
  chain: string;
  chainName: string;
  color: string;
  totalVolume24h: number;
  volumeChange: number;
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
  direction: 'in' | 'out'; // in = →ZEC, out = ZEC→
  shielded: boolean | null; // null = unknown yet
  status: string; // SUCCESS, PROCESSING, FAILED, etc.
  amountUsd?: number;
}

interface CrossChainStats {
  totalVolume24h: number;
  volumeChange24h: number;
  volumeChange7d: number;
  shieldedRate: number;
  totalSwaps24h: number;
  inflows: ChainGroup[];
  outflows: ChainGroup[];
  recentSwaps: RecentSwap[];
}

// Icons
const Icons = {
  Bridge: () => (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
    </svg>
  ),
  ArrowIn: () => (
    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
    </svg>
  ),
  ArrowOut: () => (
    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
    </svg>
  ),
  Shield: () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  ),
  Warning: () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  ),
  Pending: () => (
    <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  ),
  Live: () => (
    <span className="flex items-center gap-1.5">
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
        <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
      </span>
      <span className="text-xs font-mono text-gray-400">LIVE</span>
    </span>
  ),
};

// Chain colors and symbols
const chainConfig: Record<string, { color: string; symbol: string; name: string; iconId?: string }> = {
  btc: { color: '#F7931A', symbol: 'BTC', name: 'Bitcoin', iconId: 'btc' },
  eth: { color: '#627EEA', symbol: 'ETH', name: 'Ethereum', iconId: 'eth' },
  sol: { color: '#14F195', symbol: 'SOL', name: 'Solana', iconId: 'sol' },
  near: { color: '#00C08B', symbol: 'NEAR', name: 'NEAR', iconId: 'near' },
  usdc: { color: '#2775CA', symbol: 'USDC', name: 'USDC', iconId: 'usdc' },
  usdt: { color: '#26A17B', symbol: 'USDT', name: 'Tether', iconId: 'usdt' },
  doge: { color: '#C2A633', symbol: 'DOGE', name: 'Dogecoin', iconId: 'doge' },
  xrp: { color: '#23292F', symbol: 'XRP', name: 'Ripple', iconId: 'xrp' },
  zec: { color: '#F4B728', symbol: 'ZEC', name: 'Zcash', iconId: 'zec' },
  base: { color: '#0052FF', symbol: 'BASE', name: 'Base', iconId: 'eth' }, // Base uses ETH icon
  arb: { color: '#28A0F0', symbol: 'ARB', name: 'Arbitrum', iconId: 'eth' },
  pol: { color: '#8247E5', symbol: 'POL', name: 'Polygon', iconId: 'matic' },
  avax: { color: '#E84142', symbol: 'AVAX', name: 'Avalanche', iconId: 'avax' },
};

// Custom icon URLs for chains not in the standard CDN
const customIcons: Record<string, string> = {
  near: 'https://cryptologos.cc/logos/near-protocol-near-logo.svg',
};

// Crypto icon component using CDN
function CryptoIcon({ symbol, size = 32, className = '' }: { symbol: string; size?: number; className?: string }) {
  // Extract base token from "USDC (ETH)" → "usdc"
  const baseSymbol = symbol.split(' ')[0].toLowerCase();
  const config = chainConfig[baseSymbol] || chainConfig[symbol.toLowerCase()];
  const iconId = config?.iconId || baseSymbol;

  // Use custom icon if available, otherwise CDN
  const iconUrl = customIcons[iconId]
    || `https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/svg/color/${iconId}.svg`;

  return (
    <img
      src={iconUrl}
      alt={symbol}
      width={size}
      height={size}
      className={`rounded-full ${className}`}
      onError={(e) => {
        // Fallback to colored circle with initials
        const target = e.target as HTMLImageElement;
        target.style.display = 'none';
        target.parentElement?.classList.add('fallback-icon');
      }}
    />
  );
}

// Chain name mapping for full names
const chainNames: Record<string, string> = {
  eth: 'Ethereum',
  sol: 'Solana',
  btc: 'Bitcoin',
  near: 'NEAR',
  arb: 'Arbitrum',
  base: 'Base',
  pol: 'Polygon',
  avax: 'Avalanche',
  doge: 'Dogecoin',
  xrp: 'Ripple',
};

// Token display with optional chain tag for multi-chain tokens (e.g., USDC on ETH vs SOL)
function TokenWithChain({ symbol }: { symbol: string }) {
  // Parse "USDC (ETH)" → { token: "USDC", chain: "ETH" }
  const match = symbol.match(/^(\w+)\s*\((\w+)\)$/);

  if (match) {
    const [, token, chain] = match;
    const chainLower = chain.toLowerCase();
    const chainConf = chainConfig[chainLower];
    const chainFullName = chainNames[chainLower] || chain;

    return (
      <span className="flex items-center gap-1">
        <span>{token}</span>
        <span
          className="px-1.5 py-0.5 text-[9px] font-bold rounded"
          style={{
            backgroundColor: `${chainConf?.color || '#666'}20`,
            color: chainConf?.color || '#888'
          }}
        >
          {chainFullName}
        </span>
      </span>
    );
  }

  // No chain specified, just return the symbol
  return <span>{symbol}</span>;
}


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

export default function FlowsPage() {
  const [stats, setStats] = useState<CrossChainStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [apiConfigured, setApiConfigured] = useState(true);
  const hasFetchedOnce = useRef(false);

  // Fetch cross-chain stats from API
  useEffect(() => {
    const fetchStats = async () => {
      try {
        // Only show loading spinner on initial load, not on refreshes
        if (!hasFetchedOnce.current) {
          setLoading(true);
        }
        setError(null);

        const apiUrl = usePostgresApiClient()
          ? `${getApiUrl()}/api/crosschain/stats`
          : '/api/crosschain/stats';

        const response = await fetch(apiUrl);
        const data = await response.json();

        if (!data.success) {
          if (response.status === 503) {
            setApiConfigured(false);
            setError(data.message || 'NEAR Intents API not configured');
          } else {
            setError(data.error || 'Failed to fetch data');
          }
          return;
        }

        // Transform API response to our format (grouped by chain)
        const transformedStats: CrossChainStats = {
          totalVolume24h: data.totalVolume24h || 0,
          volumeChange24h: data.volumeChange24h || 0,
          volumeChange7d: data.volumeChange7d || 0,
          shieldedRate: 0, // TODO: Calculate from Zcash chain data
          totalSwaps24h: data.totalSwaps24h || 0,
          inflows: (data.inflows || []).map((c: any) => ({
            chain: c.chain,
            chainName: chainNames[c.chain] || c.chain,
            color: chainConfig[c.chain]?.color || '#666',
            totalVolume24h: c.totalVolumeUsd || c.volumeUsd || 0,
            volumeChange: c.volumeChange || 0,
            tokens: c.tokens || [{ symbol: c.symbol, volume24h: c.volumeUsd || 0 }],
          })),
          outflows: (data.outflows || []).map((c: any) => ({
            chain: c.chain,
            chainName: chainNames[c.chain] || c.chain,
            color: chainConfig[c.chain]?.color || '#666',
            totalVolume24h: c.totalVolumeUsd || c.volumeUsd || 0,
            volumeChange: c.volumeChange || 0,
            tokens: c.tokens || [{ symbol: c.symbol, volume24h: c.volumeUsd || 0 }],
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
            shielded: swap.shielded,
          })),
        };

        setStats(transformedStats);
        setApiConfigured(true);
        hasFetchedOnce.current = true;
      } catch (err) {
        console.error('Error fetching cross-chain stats:', err);
        setError('Failed to connect to API');
      } finally {
        setLoading(false);
      }
    };

    fetchStats();

    // Refresh every 60 seconds (NEAR Intents rate limit is 1 req/5s, we cache for 60s)
    const interval = setInterval(fetchStats, 60000);
    return () => clearInterval(interval);
  }, []);

  // Testnet: Cross-chain not available
  if (!isMainnet) {
    return (
      <div className="min-h-screen text-white py-8 sm:py-12 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="card bg-gradient-to-br from-gray-800/50 to-cipher-surface border-gray-500/30 text-center py-12">
            <div className="text-6xl mb-4">🔗</div>
            <h1 className="text-2xl font-bold font-mono text-gray-400 mb-4">
              Cross-Chain Available on Mainnet Only
            </h1>
            <p className="text-gray-500 max-w-lg mx-auto mb-6">
              NEAR Intents cross-chain swaps are only available for ZEC mainnet.
              Testnet ZEC (TAZ) is not supported for cross-chain operations.
            </p>
            <div className="flex justify-center gap-4">
              <a
                href="https://cipherscan.app/flows"
                className="px-4 py-2 bg-cipher-green/20 border border-cipher-green text-cipher-green rounded-lg hover:bg-cipher-green/30 transition-colors font-mono text-sm"
              >
                View on Mainnet →
              </a>
              <Link
                href="/"
                className="px-4 py-2 bg-cipher-surface/30 border border-cipher-border text-gray-300 rounded-lg hover:border-cipher-cyan transition-colors font-mono text-sm"
              >
                Back to Explorer
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen text-white py-8 sm:py-12 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cipher-cyan"></div>
            <p className="text-gray-400 ml-4 font-mono text-lg">Loading cross-chain data...</p>
          </div>
        </div>
      </div>
    );
  }

  // API not configured state
  if (!apiConfigured || error) {
    return (
      <div className="min-h-screen text-white py-8 sm:py-12 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="card bg-gradient-to-br from-yellow-900/20 to-cipher-surface border-yellow-500/30 text-center py-12">
            <div className="text-6xl mb-4">🔗</div>
            <h1 className="text-2xl font-bold font-mono text-yellow-400 mb-4">
              Cross-Chain Integration Coming Soon
            </h1>
            <p className="text-gray-400 max-w-lg mx-auto mb-6">
              {error || 'NEAR Intents API integration is being configured. This feature will show real-time ZEC swaps across Bitcoin, Ethereum, Solana, and more.'}
            </p>
            <div className="flex justify-center gap-4">
              <a
                href="https://near.org/intents"
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 bg-cipher-cyan/20 border border-cipher-cyan text-cipher-cyan rounded-lg hover:bg-cipher-cyan/30 transition-colors font-mono text-sm"
              >
                Learn about NEAR Intents
              </a>
              <Link
                href="/"
                className="px-4 py-2 bg-cipher-surface border border-cipher-border text-gray-300 rounded-lg hover:border-cipher-cyan transition-colors font-mono text-sm"
              >
                Back to Explorer
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // No data state
  if (!stats) {
    return (
      <div className="min-h-screen text-white py-8 sm:py-12 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="card text-center py-12">
            <p className="text-gray-400">No cross-chain data available</p>
          </div>
        </div>
      </div>
    );
  }

  const totalInflows = stats.inflows.reduce((sum, c) => sum + c.totalVolume24h, 0);
  const totalOutflows = stats.outflows.reduce((sum, c) => sum + c.totalVolume24h, 0);

  return (
    <div className="min-h-screen text-white py-8 sm:py-12 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold font-mono text-cipher-cyan flex items-center gap-3">
              <Icons.Bridge />
              ZEC Flows
            </h1>
            <p className="text-sm text-gray-400 mt-2">
              Real-time tracking of ZEC swaps via{' '}
              <a href="https://near.org/intents" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline">
                NEAR Intents
              </a>
            </p>
          </div>
          <Icons.Live />
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {/* 24h Volume */}
          <div className="card bg-gradient-to-br from-cyan-900/20 to-cipher-surface border-cyan-500/30">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs text-gray-400 uppercase">24H Volume</span>
              <Tooltip content="Total USD value of ZEC swapped in the last 24 hours via NEAR Intents" />
            </div>
            <div className="text-2xl sm:text-3xl font-bold text-white">
              {formatUSD(stats.totalVolume24h)}
            </div>
          </div>

          {/* Total Swaps */}
          <div className="card">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs text-gray-400 uppercase">24H Swaps</span>
            </div>
            <div className="text-2xl sm:text-3xl font-bold text-white">
              {stats.totalSwaps24h.toLocaleString()}
            </div>
          </div>
        </div>

        {/* Inflows & Outflows */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Inflows */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold font-mono text-cipher-green flex items-center gap-2">
                <Icons.ArrowIn />
                Inflows → ZEC
              </h2>
              <span className="text-sm text-gray-400">{formatUSD(totalInflows)}</span>
            </div>
            <div className="space-y-3">
              {stats.inflows.map((chainGroup) => (
                <div key={chainGroup.chain} className="group relative">
                  {/* Chain row */}
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center overflow-hidden" style={{ backgroundColor: `${chainGroup.color}15` }}>
                      <CryptoIcon symbol={chainGroup.chain} size={20} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-mono font-semibold">{chainGroup.chainName}</span>
                          {/* Token breakdown indicator */}
                          {chainGroup.tokens.length > 1 && (
                            <span className="relative cursor-help">
                              <span className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors">
                                ({chainGroup.tokens.length} tokens)
                              </span>
                              {/* Tooltip */}
                              <span className="absolute bottom-full left-0 mb-2 hidden group-hover:block z-10 bg-cipher-bg border border-cipher-border rounded-lg p-2 shadow-xl min-w-[120px]">
                                {chainGroup.tokens.map((token) => (
                                  <div key={token.symbol} className="flex items-center justify-between gap-4 text-xs py-0.5">
                                    <span className="flex items-center gap-1 text-gray-300">
                                      <CryptoIcon symbol={token.symbol} size={12} />
                                      {token.symbol}
                                    </span>
                                    <span className="text-white">{formatUSD(token.volume24h)}</span>
                                  </div>
                                ))}
                              </span>
                            </span>
                          )}
                        </div>
                        <span className="text-sm text-white">{formatUSD(chainGroup.totalVolume24h)}</span>
                      </div>
                      {/* Progress bar */}
                      <div className="h-1.5 bg-cipher-bg rounded-full overflow-hidden mt-1">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${(chainGroup.totalVolume24h / totalInflows) * 100}%`,
                            backgroundColor: chainGroup.color
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Outflows */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold font-mono text-red-400 flex items-center gap-2">
                <Icons.ArrowOut />
                Outflows ZEC →
              </h2>
              <span className="text-sm text-gray-400">{formatUSD(totalOutflows)}</span>
            </div>
            <div className="space-y-3">
              {stats.outflows.length > 0 ? (
                stats.outflows.map((chainGroup) => (
                  <div key={chainGroup.chain} className="group relative">
                    {/* Chain row */}
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center overflow-hidden" style={{ backgroundColor: `${chainGroup.color}15` }}>
                        <CryptoIcon symbol={chainGroup.chain} size={20} />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-mono font-semibold">{chainGroup.chainName}</span>
                            {/* Token breakdown indicator */}
                            {chainGroup.tokens.length > 1 && (
                              <span className="relative cursor-help">
                                <span className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors">
                                  ({chainGroup.tokens.length} tokens)
                                </span>
                                {/* Tooltip */}
                                <span className="absolute bottom-full left-0 mb-2 hidden group-hover:block z-10 bg-cipher-bg border border-cipher-border rounded-lg p-2 shadow-xl min-w-[120px]">
                                  {chainGroup.tokens.map((token) => (
                                    <div key={token.symbol} className="flex items-center justify-between gap-4 text-xs py-0.5">
                                      <span className="flex items-center gap-1 text-gray-300">
                                        <CryptoIcon symbol={token.symbol} size={12} />
                                        {token.symbol}
                                      </span>
                                      <span className="text-white">{formatUSD(token.volume24h)}</span>
                                    </div>
                                  ))}
                                </span>
                              </span>
                            )}
                          </div>
                          <span className="text-sm text-white">{formatUSD(chainGroup.totalVolume24h)}</span>
                        </div>
                        {/* Progress bar */}
                        <div className="h-1.5 bg-cipher-bg rounded-full overflow-hidden mt-1">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${(chainGroup.totalVolume24h / totalOutflows) * 100}%`,
                              backgroundColor: chainGroup.color
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-gray-500 text-sm">No outflows in selected period</p>
              )}
            </div>
          </div>
        </div>

        {/* Recent Swaps */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold font-mono text-white flex items-center gap-2">
              Recent Swaps
            </h2>
            <Icons.Live />
          </div>

          <div className="space-y-2">
            {stats.recentSwaps.map((swap) => {
              const sourceChain = chainNames[swap.fromChain] || swap.fromChain.toUpperCase();
              const isInflow = swap.direction === 'in';

              return (
              <div
                key={swap.id}
                  className="group grid grid-cols-1 sm:grid-cols-[60px_80px_1fr_1fr_1fr_110px] gap-2 items-center p-3 bg-cipher-bg/50 rounded-lg border border-cipher-border hover:border-cipher-cyan/30 hover:bg-cipher-bg/70 transition-all cursor-pointer"
                >
                  {/* Time */}
                  <span className="text-xs text-gray-500 font-mono hidden sm:block">
                    {formatRelativeTime(swap.timestamp)}
                  </span>

                  {/* Direction Tag */}
                  <div className="flex items-center gap-2 sm:block">
                    {isInflow ? (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-cipher-green/20 text-cipher-green text-[10px] font-bold rounded border border-cipher-green/30">
                        <Icons.ArrowIn />
                        <span className="hidden sm:inline">IN</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-red-500/20 text-red-400 text-[10px] font-bold rounded border border-red-500/30">
                        <Icons.ArrowOut />
                        <span className="hidden sm:inline">OUT</span>
                      </span>
                    )}
                    {/* Mobile: show time next to direction */}
                    <span className="text-xs text-gray-500 font-mono sm:hidden">
                      {formatRelativeTime(swap.timestamp)}
                    </span>
                  </div>

                  {/* Source */}
                    <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center overflow-hidden bg-cipher-surface/50">
                      <CryptoIcon symbol={isInflow ? swap.fromSymbol : 'ZEC'} size={24} />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-mono text-white font-semibold">
                        {isInflow ? swap.fromAmount : swap.fromAmount} {isInflow ? swap.fromSymbol : 'ZEC'}
                      </span>
                      <span className="text-[10px] text-gray-500">
                        {isInflow ? sourceChain : 'Zcash'}
                      </span>
                    </div>
                  </div>

                  {/* Arrow */}
                  <div className="hidden sm:block text-center">
                    <span className="text-gray-400 text-xl leading-none">→</span>
                  </div>

                  {/* Destination */}
                    <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center overflow-hidden bg-cipher-surface/50">
                      <CryptoIcon symbol={isInflow ? 'ZEC' : (chainConfig[swap.fromChain]?.symbol || swap.fromChain)} size={24} />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-mono text-white font-semibold">
                        {swap.toAmount} {isInflow ? 'ZEC' : (chainConfig[swap.fromChain]?.symbol || swap.fromChain)}
                      </span>
                      <span className="text-[10px] text-gray-500">
                        {isInflow ? 'Zcash' : sourceChain}
                      </span>
                    </div>
                </div>

                  {/* Status - based on NEAR tx status */}
                  <div className="flex justify-end">
                    {swap.status === 'SUCCESS' && (
                      <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-green-500/20 text-green-400 text-xs font-medium rounded border border-green-500/30">
                        <Icons.Shield />
                        Complete
                      </span>
                    )}
                    {swap.status === 'PROCESSING' && (
                      <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-yellow-500/20 text-yellow-400 text-xs font-medium rounded border border-yellow-500/30">
                        <Icons.Pending />
                        Processing
                      </span>
                    )}
                    {swap.status === 'FAILED' && (
                      <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-red-500/20 text-red-400 text-xs font-medium rounded border border-red-500/30">
                        <Icons.Warning />
                        Failed
                      </span>
                    )}
                    {!['SUCCESS', 'PROCESSING', 'FAILED'].includes(swap.status) && (
                      <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-gray-500/20 text-gray-400 text-xs font-medium rounded border border-gray-500/30">
                        {swap.status || 'Unknown'}
                      </span>
                    )}
                  </div>

                </div>
              );
            })}
          </div>

          <div className="mt-4 pt-4 border-t border-cipher-border text-center">
            <p className="text-xs text-gray-500 font-mono">
              Powered by{' '}
              <a href="https://near.org/intents" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline">
                NEAR Intents
              </a>
              {' '}• Data updates every 5 seconds
            </p>
          </div>
        </div>

        {/* Info Banner */}
        <div className="mt-8 p-4 bg-cyan-500/5 border border-cyan-500/20 rounded-lg">
          <p className="text-sm text-gray-400">
            <span className="text-cyan-400 font-bold">🔗 About Cross-Chain Swaps:</span>{' '}
            NEAR Intents enables trustless ZEC swaps with BTC, ETH, SOL, and 15+ other chains.
            Track real-time inflows and outflows to see how ZEC is being used across the multichain ecosystem.
          </p>
        </div>
      </div>
    </div>
  );
}
