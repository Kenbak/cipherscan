'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Tooltip } from '@/components/Tooltip';
import { CURRENCY } from '@/lib/config';

// Types
interface ChainVolume {
  chain: string;
  symbol: string;
  volume24h: number;
  volumeChange: number;
  color: string;
}

interface RecentSwap {
  id: string;
  timestamp: number;
  fromChain: string;
  fromAmount: number;
  fromSymbol: string;
  toAmount: number;
  direction: 'in' | 'out'; // in = →ZEC, out = ZEC→
  shielded: boolean | null; // null = unknown yet
}

interface CrossChainStats {
  totalVolume24h: number;
  volumeChange7d: number;
  shieldedRate: number;
  totalSwaps24h: number;
  inflows: ChainVolume[];
  outflows: ChainVolume[];
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
    <svg className="w-5 h-5 text-cipher-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
    </svg>
  ),
  ArrowOut: () => (
    <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
    </svg>
  ),
  Shield: () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
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
const chainConfig: Record<string, { color: string; symbol: string; name: string }> = {
  btc: { color: '#F7931A', symbol: 'BTC', name: 'Bitcoin' },
  eth: { color: '#627EEA', symbol: 'ETH', name: 'Ethereum' },
  sol: { color: '#14F195', symbol: 'SOL', name: 'Solana' },
  near: { color: '#00C08B', symbol: 'NEAR', name: 'NEAR' },
  usdc: { color: '#2775CA', symbol: 'USDC', name: 'USDC' },
  usdt: { color: '#26A17B', symbol: 'USDT', name: 'Tether' },
  doge: { color: '#C2A633', symbol: 'DOGE', name: 'Dogecoin' },
  xrp: { color: '#23292F', symbol: 'XRP', name: 'Ripple' },
};

// Mock data for now - will be replaced with NEAR Intents API
const mockStats: CrossChainStats = {
  totalVolume24h: 2_450_000,
  volumeChange7d: 12.5,
  shieldedRate: 67,
  totalSwaps24h: 1_234,
  inflows: [
    { chain: 'btc', symbol: 'BTC', volume24h: 890_000, volumeChange: 15, color: '#F7931A' },
    { chain: 'eth', symbol: 'ETH', volume24h: 650_000, volumeChange: -3, color: '#627EEA' },
    { chain: 'sol', symbol: 'SOL', volume24h: 340_000, volumeChange: 8, color: '#14F195' },
    { chain: 'usdc', symbol: 'USDC', volume24h: 280_000, volumeChange: 22, color: '#2775CA' },
    { chain: 'near', symbol: 'NEAR', volume24h: 180_000, volumeChange: 45, color: '#00C08B' },
  ],
  outflows: [
    { chain: 'eth', symbol: 'ETH', volume24h: 120_000, volumeChange: -5, color: '#627EEA' },
    { chain: 'sol', symbol: 'SOL', volume24h: 80_000, volumeChange: 12, color: '#14F195' },
    { chain: 'usdc', symbol: 'USDC', volume24h: 45_000, volumeChange: -8, color: '#2775CA' },
  ],
  recentSwaps: [
    { id: '1', timestamp: Date.now() - 2000, fromChain: 'btc', fromAmount: 0.5, fromSymbol: 'BTC', toAmount: 142, direction: 'in', shielded: true },
    { id: '2', timestamp: Date.now() - 15000, fromChain: 'eth', fromAmount: 1.2, fromSymbol: 'ETH', toAmount: 89, direction: 'in', shielded: false },
    { id: '3', timestamp: Date.now() - 34000, fromChain: 'usdc', fromAmount: 500, fromSymbol: 'USDC', toAmount: 12, direction: 'in', shielded: true },
    { id: '4', timestamp: Date.now() - 60000, fromChain: 'sol', fromAmount: 45, fromSymbol: 'SOL', toAmount: 320, direction: 'in', shielded: null },
    { id: '5', timestamp: Date.now() - 120000, fromChain: 'eth', fromAmount: 50, fromSymbol: 'ZEC', toAmount: 0.8, direction: 'out', shielded: true },
  ],
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

export default function CrossChainPage() {
  const [stats, setStats] = useState<CrossChainStats>(mockStats);
  const [loading, setLoading] = useState(false);
  const [timeRange, setTimeRange] = useState<'24h' | '7d' | '30d'>('24h');

  // TODO: Replace with real NEAR Intents API polling
  useEffect(() => {
    // Simulate live updates
    const interval = setInterval(() => {
      setStats(prev => ({
        ...prev,
        recentSwaps: prev.recentSwaps.map(swap => ({
          ...swap,
          timestamp: swap.timestamp, // In real impl, would fetch new swaps
        })),
      }));
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const totalInflows = stats.inflows.reduce((sum, c) => sum + c.volume24h, 0);
  const totalOutflows = stats.outflows.reduce((sum, c) => sum + c.volume24h, 0);

  return (
    <div className="min-h-screen text-white py-8 sm:py-12 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold font-mono text-cipher-cyan flex items-center gap-3">
              <Icons.Bridge />
              Cross-Chain ZEC Flows
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
            <div className="text-2xl sm:text-3xl font-bold text-cipher-cyan">
              {formatUSD(stats.totalVolume24h)}
            </div>
          </div>

          {/* 7D Trend */}
          <div className="card bg-gradient-to-br from-green-900/20 to-cipher-surface border-green-500/30">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs text-gray-400 uppercase">7D Trend</span>
            </div>
            <div className={`text-2xl sm:text-3xl font-bold ${stats.volumeChange7d >= 0 ? 'text-cipher-green' : 'text-red-400'}`}>
              {stats.volumeChange7d >= 0 ? '↑' : '↓'} {Math.abs(stats.volumeChange7d)}%
            </div>
          </div>

          {/* Shielded Rate */}
          <div className="card bg-gradient-to-br from-purple-900/20 to-cipher-surface border-purple-500/30">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs text-gray-400 uppercase">Shielded Rate</span>
              <Tooltip content="Percentage of incoming ZEC that was subsequently shielded" />
            </div>
            <div className="text-2xl sm:text-3xl font-bold text-purple-400">
              {stats.shieldedRate}%
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
              {stats.inflows.map((chain) => (
                <div key={chain.chain} className="flex items-center gap-3">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                    style={{ backgroundColor: `${chain.color}20`, color: chain.color }}
                  >
                    {chain.symbol.slice(0, 2)}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-mono">{chain.symbol}</span>
                      <span className="text-sm text-gray-400">{formatUSD(chain.volume24h)}</span>
                    </div>
                    <div className="h-2 bg-cipher-bg rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${(chain.volume24h / totalInflows) * 100}%`,
                          backgroundColor: chain.color
                        }}
                      />
                    </div>
                  </div>
                  <span className={`text-xs ${chain.volumeChange >= 0 ? 'text-cipher-green' : 'text-red-400'}`}>
                    {chain.volumeChange >= 0 ? '+' : ''}{chain.volumeChange}%
                  </span>
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
                stats.outflows.map((chain) => (
                  <div key={chain.chain} className="flex items-center gap-3">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                      style={{ backgroundColor: `${chain.color}20`, color: chain.color }}
                    >
                      {chain.symbol.slice(0, 2)}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-mono">{chain.symbol}</span>
                        <span className="text-sm text-gray-400">{formatUSD(chain.volume24h)}</span>
                      </div>
                      <div className="h-2 bg-cipher-bg rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${(chain.volume24h / totalOutflows) * 100}%`,
                            backgroundColor: chain.color
                          }}
                        />
                      </div>
                    </div>
                    <span className={`text-xs ${chain.volumeChange >= 0 ? 'text-cipher-green' : 'text-red-400'}`}>
                      {chain.volumeChange >= 0 ? '+' : ''}{chain.volumeChange}%
                    </span>
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
            {stats.recentSwaps.map((swap) => (
              <div
                key={swap.id}
                className="flex items-center justify-between p-3 bg-cipher-bg/50 rounded-lg border border-cipher-border hover:border-cipher-cyan/30 transition-all"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-500 w-16">{formatRelativeTime(swap.timestamp)}</span>

                  {swap.direction === 'in' ? (
                    <div className="flex items-center gap-2">
                      <span
                        className="px-2 py-0.5 rounded text-xs font-mono"
                        style={{ backgroundColor: `${chainConfig[swap.fromChain]?.color}20`, color: chainConfig[swap.fromChain]?.color }}
                      >
                        {swap.fromAmount} {swap.fromSymbol}
                      </span>
                      <span className="text-gray-500">→</span>
                      <span className="px-2 py-0.5 bg-yellow-500/10 text-yellow-400 rounded text-xs font-mono">
                        {swap.toAmount} ZEC
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 bg-yellow-500/10 text-yellow-400 rounded text-xs font-mono">
                        {swap.fromAmount} ZEC
                      </span>
                      <span className="text-gray-500">→</span>
                      <span
                        className="px-2 py-0.5 rounded text-xs font-mono"
                        style={{ backgroundColor: `${chainConfig[swap.fromChain]?.color}20`, color: chainConfig[swap.fromChain]?.color }}
                      >
                        {swap.toAmount} {chainConfig[swap.fromChain]?.symbol}
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {swap.shielded === true && (
                    <span className="flex items-center gap-1 text-xs text-purple-400">
                      <Icons.Shield />
                      Shielded
                    </span>
                  )}
                  {swap.shielded === false && (
                    <span className="text-xs text-yellow-400">⚠️ Transparent</span>
                  )}
                  {swap.shielded === null && (
                    <span className="text-xs text-gray-500">Pending...</span>
                  )}
                </div>
              </div>
            ))}
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
            The "Shielded Rate" shows what percentage of incoming ZEC was subsequently moved to shielded pools,
            indicating privacy-conscious usage.
          </p>
        </div>
      </div>
    </div>
  );
}
