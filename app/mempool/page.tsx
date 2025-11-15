'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { formatRelativeTime } from '@/lib/utils';
import { getApiUrl, usePostgresApiClient } from '@/lib/api-config';

interface MempoolTransaction {
  txid: string;
  size: number;
  type: 'transparent' | 'shielded' | 'mixed';
  time: number;
  vin: number;
  vout: number;
  vShieldedSpend: number;
  vShieldedOutput: number;
  orchardActions?: number;
}

interface MempoolStats {
  total: number;
  shielded: number;
  transparent: number;
  shieldedPercentage: number;
}

interface MempoolData {
  success: boolean;
  count: number;
  showing: number;
  transactions: MempoolTransaction[];
  stats: MempoolStats;
}

export default function MempoolPage() {
  const [data, setData] = useState<MempoolData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const usePostgresApi = usePostgresApiClient();

  const fetchMempool = async () => {
    try {
      // For testnet, call Express API directly (has RPC access)
      // For mainnet, call Next.js API route (will be implemented later)
      const apiUrl = usePostgresApi
        ? `${getApiUrl()}/api/mempool`
        : '/api/mempool';

      const response = await fetch(apiUrl);
      if (!response.ok) throw new Error('Failed to fetch mempool');

      const result = await response.json();
      if (result.success) {
        setData(result);
        setError(null);
      } else {
        setError(result.error || 'Failed to load mempool');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch mempool');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMempool();

    if (autoRefresh) {
      const interval = setInterval(fetchMempool, 10000); // Refresh every 10 seconds
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'shielded':
        return 'text-purple-400 bg-purple-900/20';
      case 'mixed':
        return 'text-cipher-cyan bg-cyan-900/20';
      case 'transparent':
        return 'text-gray-400 bg-gray-800/20';
      default:
        return 'text-gray-400 bg-gray-800/20';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'shielded':
        return '🛡️';
      case 'mixed':
        return '🔀';
      case 'transparent':
        return '👁️';
      default:
        return '📄';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-cipher-bg text-white py-12 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-cipher-cyan"></div>
            <p className="mt-4 text-gray-400">Loading mempool...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-cipher-bg text-white py-12 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="card bg-red-900/20 border-red-500/30">
            <h2 className="text-xl font-bold text-red-300 mb-2">Error</h2>
            <p className="text-gray-400">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cipher-bg text-white py-12 px-4">
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
            <div>
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-2 font-mono">
                💧 Mempool Viewer
              </h1>
              <p className="text-sm sm:text-base text-gray-400">
                Live view of pending transactions waiting to be mined
              </p>
            </div>

            {/* Auto-refresh toggle */}
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`px-3 sm:px-4 py-2 rounded-lg font-mono text-xs sm:text-sm transition-colors flex-shrink-0 ${
                autoRefresh
                  ? 'bg-cipher-green text-cipher-bg'
                  : 'bg-gray-700 text-gray-300'
              }`}
            >
              {autoRefresh ? '🔄 Auto-refresh ON' : '⏸️ Auto-refresh OFF'}
            </button>
          </div>

          {/* Live indicator */}
          {autoRefresh && (
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <div className="w-2 h-2 bg-cipher-green rounded-full animate-pulse"></div>
              <span>Live • Updates every 10 seconds</span>
            </div>
          )}
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8">
          {/* Total Transactions */}
          <div className="card">
            <div className="text-xs sm:text-sm text-gray-400 mb-1">Total Transactions</div>
            <div className="text-2xl sm:text-3xl font-bold text-white">{data?.count || 0}</div>
          </div>

          {/* Shielded */}
          <div className="card">
            <div className="text-xs sm:text-sm text-gray-400 mb-1">Shielded</div>
            <div className="text-2xl sm:text-3xl font-bold text-purple-400">{data?.stats.shielded || 0}</div>
          </div>

          {/* Transparent */}
          <div className="card">
            <div className="text-xs sm:text-sm text-gray-400 mb-1">Transparent</div>
            <div className="text-2xl sm:text-3xl font-bold text-gray-400">{data?.stats.transparent || 0}</div>
          </div>

          {/* Privacy Score */}
          <div className="card">
            <div className="text-xs sm:text-sm text-gray-400 mb-1">Privacy Score</div>
            <div className="text-2xl sm:text-3xl font-bold text-cipher-cyan">
              {data?.stats.shieldedPercentage.toFixed(0) || 0}%
            </div>
          </div>
        </div>

        {/* Empty State */}
        {data && data.count === 0 && (
          <div className="card text-center py-12">
            <div className="text-6xl mb-4">💤</div>
            <h3 className="text-xl font-bold text-gray-300 mb-2">Mempool is Empty</h3>
            <p className="text-gray-400">
              No pending transactions at the moment. All transactions have been mined!
            </p>
          </div>
        )}

        {/* Transactions List */}
        {data && data.count > 0 && (
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">
                Pending Transactions ({data.showing} of {data.count})
              </h2>
              {data.count > data.showing && (
                <span className="text-sm text-gray-400">
                  Showing first {data.showing} transactions
                </span>
              )}
            </div>

            {/* Mobile: Scroll indicator */}
            <div className="md:hidden mb-4 text-sm text-gray-400 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
              </svg>
              <span>Scroll horizontally to see more</span>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px]">
                <thead>
                  <tr className="border-b border-cipher-border">
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-400">Type</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-400">Transaction Hash</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-400">Inputs</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-400">Outputs</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-400">Size</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-400">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {data.transactions.map((tx) => (
                    <tr key={tx.txid} className="border-b border-cipher-border/50 hover:bg-cipher-surface/50 transition-colors">
                      {/* Type */}
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-mono ${getTypeColor(tx.type)}`}>
                          <span>{getTypeIcon(tx.type)}</span>
                          <span className="uppercase">{tx.type}</span>
                        </span>
                      </td>

                      {/* Hash */}
                      <td className="py-3 px-4">
                        <Link
                          href={`/tx/${tx.txid}`}
                          className="font-mono text-sm text-cipher-cyan hover:text-cyan-400 transition-colors"
                        >
                          {tx.txid.slice(0, 8)}...{tx.txid.slice(-8)}
                        </Link>
                      </td>

                      {/* Inputs */}
                      <td className="py-3 px-4 font-mono text-sm">
                        {tx.orchardActions && tx.orchardActions > 0 ? (
                          <span className="text-purple-400">{tx.orchardActions} 🛡️ Orchard</span>
                        ) : tx.type === 'shielded' || tx.type === 'mixed' ? (
                          <span className="text-purple-400">{tx.vShieldedSpend} 🛡️ Sapling</span>
                        ) : (
                          <span className="text-gray-400">{tx.vin} 👁️</span>
                        )}
                      </td>

                      {/* Outputs */}
                      <td className="py-3 px-4 font-mono text-sm">
                        {tx.orchardActions && tx.orchardActions > 0 ? (
                          <span className="text-purple-400">{tx.orchardActions} 🛡️ Orchard</span>
                        ) : tx.type === 'shielded' || tx.type === 'mixed' ? (
                          <span className="text-purple-400">{tx.vShieldedOutput} 🛡️ Sapling</span>
                        ) : (
                          <span className="text-gray-400">{tx.vout} 👁️</span>
                        )}
                      </td>

                      {/* Size */}
                      <td className="py-3 px-4 font-mono text-sm text-gray-400">
                        {(tx.size / 1024).toFixed(2)} KB
                      </td>

                      {/* Time */}
                      <td className="py-3 px-4 text-sm text-gray-400">
                        {formatRelativeTime(tx.time)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Info Card */}
        <div className="card mt-8 bg-cipher-surface/50">
          <h3 className="font-bold text-cipher-cyan mb-3">About the Mempool</h3>
          <div className="space-y-2 text-sm text-gray-400">
            <p>
              <strong className="text-white">Mempool</strong> = Memory Pool of unconfirmed transactions waiting to be included in the next block.
            </p>
            <p>
              <strong className="text-white">Shielded transactions</strong> use zero-knowledge proofs to hide sender, receiver, and amount.
            </p>
            <p>
              <strong className="text-white">Mixed transactions</strong> are shielding (transparent → shielded) or deshielding (shielded → transparent).
            </p>
            <p>
              <strong className="text-white">Privacy Score</strong> = Percentage of transactions using shielded pools (higher = better privacy).
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}
