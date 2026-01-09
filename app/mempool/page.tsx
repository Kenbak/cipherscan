'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { formatRelativeTime } from '@/lib/utils';
import { getApiUrl, usePostgresApiClient } from '@/lib/api-config';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';

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

  const getTypeBadgeColor = (type: string): 'purple' | 'cyan' | 'muted' => {
    switch (type) {
      case 'shielded':
        return 'purple';
      case 'mixed':
        return 'cyan';
      default:
        return 'muted';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen py-12 px-4">
        <div className="max-w-7xl mx-auto">
          <Card className="text-center py-16">
            <CardBody>
              <div className="inline-block animate-spin rounded-full h-10 w-10 border-2 border-cipher-cyan border-t-transparent"></div>
              <p className="mt-4 text-secondary">Loading mempool...</p>
            </CardBody>
          </Card>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen py-12 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="alert alert-error">
            <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="font-semibold">Error loading mempool</p>
              <p className="text-sm opacity-80">{error}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-12 px-4">
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <div className="mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-cyan-500/10 flex items-center justify-center">
                <svg className="w-6 h-6 text-cipher-cyan" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-primary">
                  Mempool Viewer
                </h1>
                <p className="text-sm text-secondary">
                  Live view of pending transactions waiting to be mined
                </p>
              </div>
            </div>

            {/* Auto-refresh toggle */}
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`btn btn-sm font-mono ${
                autoRefresh
                  ? 'bg-cipher-green/10 text-cipher-green border border-cipher-green/30'
                  : 'btn-secondary'
              }`}
            >
              {autoRefresh ? 'Auto-refresh ON' : 'Auto-refresh OFF'}
            </button>
          </div>

          {/* Live indicator */}
          {autoRefresh && (
            <div className="flex items-center gap-2 text-sm text-secondary ml-16">
              <div className="w-2 h-2 bg-cipher-green rounded-full animate-pulse"></div>
              <span>Live • Updates every 10 seconds</span>
            </div>
          )}
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {/* Total Transactions */}
          <Card variant="compact">
            <CardBody>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg bg-cipher-surface flex items-center justify-center">
                  <svg className="w-4 h-4 text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                </div>
                <span className="text-xs text-secondary uppercase tracking-wide">Total TXs</span>
              </div>
              <div className="text-2xl font-bold text-primary font-mono">{data?.count || 0}</div>
            </CardBody>
          </Card>

          {/* Shielded */}
          <Card variant="compact">
            <CardBody>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
                  <svg className="w-4 h-4 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <span className="text-xs text-secondary uppercase tracking-wide">Shielded</span>
              </div>
              <div className="text-2xl font-bold text-purple-400 font-mono">{data?.stats.shielded || 0}</div>
            </CardBody>
          </Card>

          {/* Transparent */}
          <Card variant="compact">
            <CardBody>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg bg-cipher-surface flex items-center justify-center">
                  <svg className="w-4 h-4 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                </div>
                <span className="text-xs text-secondary uppercase tracking-wide">Transparent</span>
              </div>
              <div className="text-2xl font-bold text-muted font-mono">{data?.stats.transparent || 0}</div>
            </CardBody>
          </Card>

          {/* Privacy Score */}
          <Card variant="compact">
            <CardBody>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg bg-cipher-cyan/10 flex items-center justify-center">
                  <svg className="w-4 h-4 text-cipher-cyan" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <span className="text-xs text-secondary uppercase tracking-wide">Privacy Score</span>
              </div>
              <div className="text-2xl font-bold text-cipher-cyan font-mono">
                {data?.stats.shieldedPercentage.toFixed(0) || 0}%
              </div>
            </CardBody>
          </Card>
        </div>

        {/* Empty State */}
        {data && data.count === 0 && (
          <Card className="text-center py-16">
            <CardBody>
              <div className="w-16 h-16 rounded-2xl bg-cipher-surface flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-primary mb-2">Mempool is Empty</h3>
              <p className="text-secondary">
                No pending transactions at the moment. All transactions have been mined!
              </p>
            </CardBody>
          </Card>
        )}

        {/* Transactions List */}
        {data && data.count > 0 && (
          <Card>
            <CardHeader>
              <h2 className="text-lg font-bold text-primary">
                Pending Transactions
              </h2>
              <Badge color="cyan" className="ml-2">{data.showing} of {data.count}</Badge>
              {data.count > data.showing && (
                <span className="text-sm text-muted ml-auto">
                  Showing first {data.showing}
                </span>
              )}
            </CardHeader>
            <CardBody>
              {/* Mobile: Scroll indicator */}
              <div className="md:hidden mb-4 text-sm text-muted flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                </svg>
                <span>Scroll horizontally to see more</span>
              </div>

              {/* Table */}
              <div className="overflow-x-auto -mx-6">
                <table className="w-full min-w-[800px]">
                  <thead>
                    <tr className="border-b border-cipher-border">
                      <th className="text-left py-3 px-6 text-xs font-medium text-muted uppercase tracking-wide">Type</th>
                      <th className="text-left py-3 px-4 text-xs font-medium text-muted uppercase tracking-wide">Transaction Hash</th>
                      <th className="text-left py-3 px-4 text-xs font-medium text-muted uppercase tracking-wide">Inputs</th>
                      <th className="text-left py-3 px-4 text-xs font-medium text-muted uppercase tracking-wide">Outputs</th>
                      <th className="text-left py-3 px-4 text-xs font-medium text-muted uppercase tracking-wide">Size</th>
                      <th className="text-left py-3 px-6 text-xs font-medium text-muted uppercase tracking-wide">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.transactions.map((tx) => (
                      <tr key={tx.txid} className="border-b border-cipher-border/30 hover:bg-cipher-hover/50 transition-colors">
                        {/* Type */}
                        <td className="py-3 px-6">
                          <Badge color={getTypeBadgeColor(tx.type)}>
                            {tx.type.toUpperCase()}
                          </Badge>
                        </td>

                        {/* Hash */}
                        <td className="py-3 px-4">
                          <Link
                            href={`/tx/${tx.txid}`}
                            className="font-mono text-sm text-cipher-cyan hover:text-cyan-300 transition-colors"
                          >
                            {tx.txid.slice(0, 8)}...{tx.txid.slice(-8)}
                          </Link>
                        </td>

                        {/* Inputs */}
                        <td className="py-3 px-4 font-mono text-sm">
                          {tx.orchardActions && tx.orchardActions > 0 ? (
                            <span className="text-purple-400">{tx.orchardActions} Orchard</span>
                          ) : tx.type === 'shielded' || tx.type === 'mixed' ? (
                            <span className="text-purple-400">{tx.vShieldedSpend} Sapling</span>
                          ) : (
                            <span className="text-muted">{tx.vin} t-in</span>
                          )}
                        </td>

                        {/* Outputs */}
                        <td className="py-3 px-4 font-mono text-sm">
                          {tx.orchardActions && tx.orchardActions > 0 ? (
                            <span className="text-purple-400">{tx.orchardActions} Orchard</span>
                          ) : tx.type === 'shielded' || tx.type === 'mixed' ? (
                            <span className="text-purple-400">{tx.vShieldedOutput} Sapling</span>
                          ) : (
                            <span className="text-muted">{tx.vout} t-out</span>
                          )}
                        </td>

                        {/* Size */}
                        <td className="py-3 px-4 font-mono text-sm text-muted">
                          {(tx.size / 1024).toFixed(2)} KB
                        </td>

                        {/* Time */}
                        <td className="py-3 px-6 text-sm text-muted">
                          {formatRelativeTime(tx.time)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardBody>
          </Card>
        )}

        {/* Info Card */}
        <Card variant="glass" className="mt-8">
          <CardBody>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-cipher-cyan/10 flex items-center justify-center">
                <svg className="w-5 h-5 text-cipher-cyan" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-primary">About the Mempool</h3>
            </div>
            <div className="grid sm:grid-cols-2 gap-4 text-sm">
              <div className="space-y-1">
                <p className="font-medium text-primary">Mempool</p>
                <p className="text-secondary">Memory Pool of unconfirmed transactions waiting to be included in the next block.</p>
              </div>
              <div className="space-y-1">
                <p className="font-medium text-purple-400">Shielded Transactions</p>
                <p className="text-secondary">Use zero-knowledge proofs to hide sender, receiver, and amount.</p>
              </div>
              <div className="space-y-1">
                <p className="font-medium text-cipher-cyan">Mixed Transactions</p>
                <p className="text-secondary">Shielding (transparent → shielded) or deshielding (shielded → transparent).</p>
              </div>
              <div className="space-y-1">
                <p className="font-medium text-cipher-green">Privacy Score</p>
                <p className="text-secondary">Percentage of transactions using shielded pools (higher = better privacy).</p>
              </div>
            </div>
          </CardBody>
        </Card>

      </div>
    </div>
  );
}
