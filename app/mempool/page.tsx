'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { formatRelativeTime } from '@/lib/utils';
import { getApiUrl, usePostgresApiClient } from '@/lib/api-config';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { MempoolBubbles } from '@/components/MempoolBubbles';

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
  const [showTable, setShowTable] = useState(false);
  const usePostgresApi = usePostgresApiClient();

  const fetchMempool = async () => {
    try {
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
      const interval = setInterval(fetchMempool, 10000);
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  const getTypeBadgeColor = (type: string): 'purple' | 'orange' | 'cyan' => {
    switch (type) {
      case 'shielded':
        return 'purple';
      case 'mixed':
        return 'orange';
      default:
        return 'cyan';
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-cipher-cyan border-t-transparent" />
          <p className="text-secondary ml-4 font-mono">Loading mempool...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
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
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      {/* Header - cypherpunk style */}
      <div className="mb-8 animate-fade-in">
        <p className="text-xs text-muted font-mono uppercase tracking-widest mb-3">
          <span className="opacity-50">{'>'}</span> MEMPOOL_VIEWER
        </p>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl sm:text-3xl font-bold text-primary">
            Mempool
          </h1>
          <div className="flex items-center gap-3">
            {autoRefresh && (
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cipher-green opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-cipher-green"></span>
                </span>
                <span className="text-xs text-muted font-mono">LIVE</span>
              </div>
            )}
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`filter-btn ${autoRefresh ? 'filter-btn-active' : ''}`}
            >
              {autoRefresh ? 'Auto-refresh ON' : 'Auto-refresh OFF'}
            </button>
          </div>
        </div>
        <p className="text-sm text-secondary mt-2">
          Pending transactions waiting to be mined
        </p>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-8 animate-fade-in-up" style={{ animationDelay: '50ms' }}>
        <Card variant="compact">
          <CardBody>
            <span className="text-xs text-muted uppercase tracking-wide">Total TXs</span>
            <div className="text-2xl font-bold text-primary font-mono mt-1">{data?.count || 0}</div>
          </CardBody>
        </Card>
        <Card variant="compact">
          <CardBody>
            <span className="text-xs text-muted uppercase tracking-wide">Shielded</span>
            <div className="text-2xl font-bold text-cipher-purple font-mono mt-1">{data?.stats.shielded || 0}</div>
          </CardBody>
        </Card>
        <Card variant="compact">
          <CardBody>
            <span className="text-xs text-muted uppercase tracking-wide">Transparent</span>
            <div className="text-2xl font-bold text-secondary font-mono mt-1">{data?.stats.transparent || 0}</div>
          </CardBody>
        </Card>
        <Card variant="compact">
          <CardBody>
            <span className="text-xs text-muted uppercase tracking-wide">Privacy Score</span>
            <div className="text-2xl font-bold text-cipher-cyan font-mono mt-1">
              {data?.stats.shieldedPercentage.toFixed(0) || 0}%
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Bubble Visualization - always mounted to avoid layout shift */}
      <div className="mb-8 animate-fade-in-up" style={{ animationDelay: '100ms' }}>
        <Card className="overflow-hidden">
          <CardBody className="!p-0">
            <MempoolBubbles
              transactions={data?.transactions ?? []}
              className="h-[350px] sm:h-[420px]"
            />
          </CardBody>
        </Card>
      </div>

      {/* Transaction Table - Collapsible */}
      {data && data.count > 0 && (
        <div className="animate-fade-in-up" style={{ animationDelay: '150ms' }}>
          <button
            onClick={() => setShowTable(!showTable)}
            className="flex items-center gap-2 mb-4 text-sm text-secondary hover:text-primary transition-colors font-mono"
          >
            <svg
              className={`w-4 h-4 transition-transform ${showTable ? 'rotate-90' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            {showTable ? 'Hide' : 'Show'} Transaction Table
            <Badge color="cyan">{data.showing} of {data.count}</Badge>
          </button>

          {showTable && (
            <Card>
              <CardBody>
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
                        <tr key={tx.txid} className="border-b border-cipher-border hover:bg-cipher-hover/50 transition-colors">
                          <td className="py-3 px-6">
                            <Badge color={getTypeBadgeColor(tx.type)}>
                              {tx.type.toUpperCase()}
                            </Badge>
                          </td>
                          <td className="py-3 px-4">
                            <Link
                              href={`/tx/${tx.txid}`}
                              className="font-mono text-sm text-cipher-cyan hover:text-cipher-cyan-glow transition-colors"
                            >
                              {tx.txid.slice(0, 8)}...{tx.txid.slice(-8)}
                            </Link>
                          </td>
                          <td className="py-3 px-4 font-mono text-sm">
                            {tx.orchardActions && tx.orchardActions > 0 ? (
                              <span className="text-cipher-purple">{tx.orchardActions} Orchard</span>
                            ) : tx.type === 'shielded' || tx.type === 'mixed' ? (
                              <span className="text-cipher-purple">{tx.vShieldedSpend} Sapling</span>
                            ) : (
                              <span className="text-muted">{tx.vin} t-in</span>
                            )}
                          </td>
                          <td className="py-3 px-4 font-mono text-sm">
                            {tx.orchardActions && tx.orchardActions > 0 ? (
                              <span className="text-cipher-purple">{tx.orchardActions} Orchard</span>
                            ) : tx.type === 'shielded' || tx.type === 'mixed' ? (
                              <span className="text-cipher-purple">{tx.vShieldedOutput} Sapling</span>
                            ) : (
                              <span className="text-muted">{tx.vout} t-out</span>
                            )}
                          </td>
                          <td className="py-3 px-4 font-mono text-sm text-muted">
                            {(tx.size / 1024).toFixed(2)} KB
                          </td>
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
        </div>
      )}

      {/* Info Card */}
      <Card variant="glass" className="mt-8 animate-fade-in-up" style={{ animationDelay: '200ms' }}>
        <CardBody>
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xs text-muted font-mono uppercase tracking-widest opacity-50">{'>'}</span>
            <h3 className="text-sm font-bold font-mono text-secondary uppercase tracking-wider">ABOUT_MEMPOOL</h3>
          </div>
          <div className="grid sm:grid-cols-2 gap-4 text-sm">
            <div className="space-y-1">
              <p className="font-medium text-primary">Mempool</p>
              <p className="text-secondary">Memory Pool of unconfirmed transactions waiting to be included in the next block.</p>
            </div>
            <div className="space-y-1">
              <p className="font-medium text-cipher-purple">Shielded Transactions</p>
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
  );
}
