'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { formatRelativeTime } from '@/lib/utils';
import { getApiUrl, usePostgresApiClient } from '@/lib/api-config';
import { useWebSocket } from '@/hooks/useWebSocket';
import { Card, CardBody } from '@/components/ui/Card';
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
  totalOutput?: number;
  valueBalanceSapling?: number;
  valueBalanceOrchard?: number;
  version?: number;
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
  const [showTable, setShowTable] = useState(true);
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

  const handleWsMessage = useCallback((msg: any) => {
    if (msg.type === 'mempool_tx' && msg.data?.txid) {
      setData(prev => {
        if (!prev) return prev;
        const hasShielded = msg.data.hasOrchard || msg.data.hasSapling;
        const hasTransparent = (msg.data.inputCount || 0) > 0 || (msg.data.outputCount || 0) > 0;
        const type = hasShielded && hasTransparent ? 'mixed' : hasShielded ? 'shielded' : 'transparent';
        const newTx: MempoolTransaction = {
          txid: msg.data.txid,
          size: msg.data.size || 0,
          type: type as any,
          time: msg.data.time || Math.floor(Date.now() / 1000),
          vin: msg.data.inputCount || 0,
          vout: msg.data.outputCount || 0,
          vShieldedSpend: 0,
          vShieldedOutput: 0,
          orchardActions: 0,
          totalOutput: msg.data.totalOutput,
        };
        const txs = [newTx, ...prev.transactions.filter(t => t.txid !== msg.data.txid)];
        return { ...prev, transactions: txs, count: prev.count + 1, showing: txs.length };
      });
    } else if (msg.type === 'mempool_removed' && msg.data?.txid) {
      setData(prev => {
        if (!prev) return prev;
        const txs = prev.transactions.filter(t => t.txid !== msg.data.txid);
        return { ...prev, transactions: txs, count: Math.max(0, prev.count - 1), showing: txs.length };
      });
    }
  }, []);

  const { isConnected: wsConnected } = useWebSocket({ onMessage: handleWsMessage });

  useEffect(() => {
    fetchMempool();

    if (autoRefresh) {
      // Slower polling when WebSocket is active
      const interval = setInterval(fetchMempool, wsConnected ? 30000 : 10000);
      return () => clearInterval(interval);
    }
  }, [autoRefresh, wsConnected]);

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
      <div className="mb-2 animate-fade-in-up" style={{ animationDelay: '100ms' }}>
        <Card className="overflow-hidden">
          <CardBody className="!p-0">
            <MempoolBubbles
              transactions={data?.transactions ?? []}
              className="h-[350px] sm:h-[420px]"
            />
          </CardBody>
        </Card>
      </div>

      {/* Caption explaining the visualization */}
      <div className="mb-8 flex items-start gap-2 text-xs text-muted px-1">
        <svg className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <circle cx="12" cy="12" r="10" />
          <path strokeLinecap="round" d="M12 16v-4M12 8h.01" />
        </svg>
        <p className="leading-relaxed">
          Each bubble is a pending transaction. <span className="text-secondary">Size</span> reflects byte size; <span className="text-secondary">color &amp; letter</span> mark the privacy type — <span className="text-cipher-cyan font-mono">T</span> transparent, <span className="text-cipher-orange font-mono">M</span> mixed, <span className="text-cipher-purple font-mono">S</span> shielded. Hover to inspect, click to open.
        </p>
      </div>

      {/* Transaction Table */}
      {data && data.count > 0 && (
        <div className="animate-fade-in-up" style={{ animationDelay: '150ms' }}>
          {/* Section header */}
          <div className="flex items-center justify-between mb-4 px-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted font-mono uppercase tracking-widest opacity-50">{'>'}</span>
              <h3 className="text-sm font-bold font-mono text-secondary uppercase tracking-wider">PENDING_TRANSACTIONS</h3>
              <Badge color="cyan">{data.showing} of {data.count}</Badge>
            </div>
            <button
              onClick={() => setShowTable(!showTable)}
              className="flex items-center gap-1.5 text-xs text-muted hover:text-primary transition-colors font-mono"
            >
              <svg
                className={`w-3.5 h-3.5 transition-transform ${showTable ? 'rotate-90' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              {showTable ? 'Hide' : 'Show'}
            </button>
          </div>

          {showTable && (
            <div className="card p-0 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted border-b border-cipher-border">TxID</th>
                      <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted border-b border-cipher-border">Type</th>
                      <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-muted border-b border-cipher-border">Value</th>
                      <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-muted border-b border-cipher-border hidden md:table-cell">Inputs</th>
                      <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-muted border-b border-cipher-border hidden md:table-cell">Outputs</th>
                      <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-muted border-b border-cipher-border hidden sm:table-cell">Size</th>
                      <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-muted border-b border-cipher-border">Seen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.transactions.map((tx, i) => {
                      const totalOut = tx.totalOutput ?? 0;
                      return (
                        <tr
                          key={tx.txid}
                          className="group transition-colors duration-100 hover:bg-[var(--color-hover)] animate-fade-in-up"
                          style={{ animationDelay: `${Math.min(i * 20, 300)}ms` }}
                        >
                          <td className="px-4 h-[44px] border-b border-cipher-border">
                            <Link
                              href={`/tx/${tx.txid}`}
                              className="font-mono text-xs text-primary hover:text-cipher-cyan transition-colors truncate block max-w-[120px] sm:max-w-[180px]"
                            >
                              <span className="sm:hidden">{tx.txid.slice(0, 8)}...{tx.txid.slice(-4)}</span>
                              <span className="hidden sm:inline">{tx.txid.slice(0, 12)}...{tx.txid.slice(-6)}</span>
                            </Link>
                          </td>
                          <td className="px-4 h-[44px] border-b border-cipher-border">
                            <Badge color={getTypeBadgeColor(tx.type)}>
                              {tx.type.toUpperCase()}
                            </Badge>
                          </td>
                          <td className="px-4 h-[44px] border-b border-cipher-border text-right">
                            {tx.type === 'shielded' ? (
                              <span className="text-xs text-muted italic" title="Values are encrypted in fully shielded transactions">
                                encrypted
                              </span>
                            ) : totalOut > 0 ? (
                              <span className="font-mono text-xs text-primary">
                                {totalOut.toFixed(4)}<span className="text-muted ml-1">ZEC</span>
                              </span>
                            ) : (
                              <span className="text-muted">—</span>
                            )}
                          </td>
                          <td className="px-4 h-[44px] border-b border-cipher-border text-right hidden md:table-cell">
                            {tx.orchardActions && tx.orchardActions > 0 ? (
                              <span className="font-mono text-xs text-cipher-purple">{tx.orchardActions}<span className="text-muted ml-1">orchard</span></span>
                            ) : tx.vShieldedSpend > 0 ? (
                              <span className="font-mono text-xs text-cipher-purple">{tx.vShieldedSpend}<span className="text-muted ml-1">sapling</span></span>
                            ) : (
                              <span className="font-mono text-xs text-muted">{tx.vin}</span>
                            )}
                          </td>
                          <td className="px-4 h-[44px] border-b border-cipher-border text-right hidden md:table-cell">
                            {tx.orchardActions && tx.orchardActions > 0 ? (
                              <span className="font-mono text-xs text-cipher-purple">{tx.orchardActions}<span className="text-muted ml-1">orchard</span></span>
                            ) : tx.vShieldedOutput > 0 ? (
                              <span className="font-mono text-xs text-cipher-purple">{tx.vShieldedOutput}<span className="text-muted ml-1">sapling</span></span>
                            ) : (
                              <span className="font-mono text-xs text-muted">{tx.vout}</span>
                            )}
                          </td>
                          <td className="px-4 h-[44px] border-b border-cipher-border text-right hidden sm:table-cell">
                            <span className="font-mono text-xs text-muted">{(tx.size / 1024).toFixed(1)} KB</span>
                          </td>
                          <td className="px-4 h-[44px] border-b border-cipher-border text-right">
                            <span className="text-xs text-muted whitespace-nowrap">{formatRelativeTime(tx.time)}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
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
