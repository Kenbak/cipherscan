'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { formatRelativeTime } from '@/lib/utils';
import { getApiUrl, usePostgresApiClient } from '@/lib/api-config';
import { useWebSocket } from '@/hooks/useWebSocket';
import { Card, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { PageHeader, SectionHeader } from '@/components/ui/SectionHeader';
import { MetricCard } from '@/components/ui/MetricCard';
import { HashLink } from '@/components/ui/HashLink';
import { MempoolBubbles, type MempoolBubblesHandle } from '@/components/MempoolBubbles';

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
  ironwoodActions?: number;
  totalOutput?: number;
  valueBalanceSapling?: number;
  valueBalanceOrchard?: number;
  valueBalanceIronwood?: number;
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

export default function MempoolClient() {
  const [data, setData] = useState<MempoolData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [showTable, setShowTable] = useState(true);
  const [blockPulse, setBlockPulse] = useState(0);
  const bubblesRef = useRef<MempoolBubblesHandle>(null);
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
        const hasShielded = msg.data.hasOrchard || msg.data.hasSapling || msg.data.hasIronwood;
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
          orchardActions: msg.data.orchardActions || 0,
          ironwoodActions: msg.data.ironwoodActions || 0,
          valueBalanceIronwood: msg.data.valueBalanceIronwood || 0,
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
    } else if (msg.type === 'new_block') {
      // Trigger the shockwave animation on the bubble canvas
      setBlockPulse(p => p + 1);
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
    // Heading + intro render server-side during the loading state so the
    // initial HTML carries real content (matters for SEO and first paint).
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <PageHeader
          eyebrow="MEMPOOL_VIEWER"
          title="Zcash Mempool — Pending Transactions"
          subtitle="Transactions waiting to be mined into the next Zcash block, streamed in real time. Shielded, transparent, and mixed transactions are labeled as they enter the queue."
        />
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
      <PageHeader
        eyebrow="MEMPOOL_VIEWER"
        title="Zcash Mempool — Pending Transactions"
        subtitle="Transactions waiting to be mined into the next Zcash block, streamed in real time. Shielded, transparent, and mixed transactions are labeled as they enter the queue."
      />

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-8 animate-fade-in-up stagger-2">
        <MetricCard label="Total TXs" value={data?.count || 0} />
        <MetricCard label="Shielded" value={data?.stats.shielded || 0} accent="purple" />
        <MetricCard label="Transparent" value={data?.stats.transparent || 0} />
        <MetricCard label="Privacy Score" value={`${data?.stats.shieldedPercentage.toFixed(0) || 0}%`} accent="cyan" />
      </div>

      {/* Bubble Visualization - always mounted to avoid layout shift */}
      <div className="mb-2 animate-fade-in-up stagger-3">
        {/* Section header — same pattern as chart sections on /mining and /pools */}
        <SectionHeader
          label="MEMPOOL_LIVE"
          live={autoRefresh && wsConnected}
          className="px-1"
          actions={
            <>
            {/* LIVE / PAUSED segmented pill — canonical filter-group pattern */}
            <div className="filter-group flex-shrink-0">
              {([true, false] as const).map(on => (
                <button
                  key={String(on)}
                  onClick={() => setAutoRefresh(on)}
                  className={`filter-btn ${autoRefresh === on ? 'filter-btn-active' : ''}`}
                >
                  {on ? 'LIVE' : 'PAUSED'}
                </button>
              ))}
            </div>
            {/* Fullscreen */}
            <button
              onClick={() => bubblesRef.current?.toggleFullscreen()}
              className="p-1.5 rounded-md bg-glass-3 text-muted hover:text-cipher-cyan transition-colors"
              title="Fullscreen (ESC to exit)"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
              </svg>
            </button>
            {/* Screensaver mode */}
            <Link
              href="/mempool/live"
              className="hidden sm:inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-glass-3 text-[10px] font-mono text-muted hover:text-cipher-cyan transition-colors"
              title="Ambient screensaver mode — great on a second monitor"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="20" height="14" rx="2" />
                <path d="M8 21h8M12 17v4" />
              </svg>
              SCREENSAVER
            </Link>
            </>
          }
        />
        <Card className="overflow-hidden">
          <CardBody className="!p-0">
            <MempoolBubbles
              ref={bubblesRef}
              transactions={data?.transactions ?? []}
              className="h-[350px] sm:h-[420px]"
              stats={data?.stats ? { total: data.count, shieldedPct: Math.round(data.stats.shieldedPercentage) } : null}
              blockPulse={blockPulse}
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
          Each bubble is a pending transaction. <span className="text-secondary">Size</span> reflects byte size; <span className="text-secondary">color &amp; letter</span> mark the privacy type — <span className="text-cipher-cyan font-mono">T</span> transparent, <span className="text-cipher-orange font-mono">M</span> mixed, <span className="text-cipher-purple font-mono">S</span> shielded. Hover to inspect, click to open, drag to fling. When a block is mined, a shockwave clears the confirmed transactions.
        </p>
      </div>

      {/* Transaction Table */}
      {data && data.count > 0 && (
        <div className="animate-fade-in-up stagger-4">
          {/* Section header */}
          <SectionHeader
            label="PENDING_TRANSACTIONS"
            className="px-1"
            actions={
              <>
              <Badge color="cyan">{data.showing} of {data.count}</Badge>
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
              </>
            }
          />

          {showTable && (
            <div className="card p-0 overflow-hidden">
              {/* Live-entry row animations — DataTable lacks per-row classes;
                  th/td classes mirror its conventions exactly */}
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
                          className="group transition-colors duration-100 hover:bg-cipher-hover animate-fade-in-up"
                          style={{ animationDelay: `${Math.min(i * 20, 300)}ms` }}
                        >
                          <td className="px-4 h-[44px] border-b border-cipher-border">
                            <HashLink value={tx.txid} href={`/tx/${tx.txid}`} lead={12} tail={6} responsive />
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
                            {tx.ironwoodActions && tx.ironwoodActions > 0 ? (
                              <span className="font-mono text-xs text-cipher-yellow">{tx.ironwoodActions}<span className="text-muted ml-1">ironwood</span></span>
                            ) : tx.orchardActions && tx.orchardActions > 0 ? (
                              <span className="font-mono text-xs text-cipher-purple">{tx.orchardActions}<span className="text-muted ml-1">orchard</span></span>
                            ) : tx.vShieldedSpend > 0 ? (
                              <span className="font-mono text-xs text-cipher-cyan">{tx.vShieldedSpend}<span className="text-muted ml-1">sapling</span></span>
                            ) : (
                              <span className="font-mono text-xs text-muted">{tx.vin}</span>
                            )}
                          </td>
                          <td className="px-4 h-[44px] border-b border-cipher-border text-right hidden md:table-cell">
                            {tx.ironwoodActions && tx.ironwoodActions > 0 ? (
                              <span className="font-mono text-xs text-cipher-yellow">{tx.ironwoodActions}<span className="text-muted ml-1">ironwood</span></span>
                            ) : tx.orchardActions && tx.orchardActions > 0 ? (
                              <span className="font-mono text-xs text-cipher-purple">{tx.orchardActions}<span className="text-muted ml-1">orchard</span></span>
                            ) : tx.vShieldedOutput > 0 ? (
                              <span className="font-mono text-xs text-cipher-cyan">{tx.vShieldedOutput}<span className="text-muted ml-1">sapling</span></span>
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
      <Card variant="glass" className="mt-8 animate-fade-in-up stagger-5">
        <CardBody>
          <SectionHeader label="ABOUT_MEMPOOL" />
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
