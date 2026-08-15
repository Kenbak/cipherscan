'use client';

import { useState, useEffect, useRef, memo, useCallback } from 'react';
import { formatRelativeTime } from '@/lib/utils';
import { formatZecPrecise } from '@/lib/format-numbers';
import { usePostgresApiClient, getApiUrl } from '@/lib/api-config';
import { useWebSocket } from '@/hooks/useWebSocket';
import { ShieldFlowBadge, ShieldFlowLegend } from '@/components/ShieldFlowBadge';
import { resolveShieldFlowType } from '@/components/icons/shield-flow';
import { HashLink, SkeletonTable } from '@/components/ui';

interface ShieldedTx {
  txid: string;
  blockHeight: number;
  blockTime: number;
  hasSapling: boolean;
  hasOrchard: boolean;
  hasIronwood: boolean;
  saplingSpendCount: number;
  saplingOutputCount: number;
  orchardActions: number;
  ironwoodActions: number;
  vinCount: number;
  voutCount: number;
  valueBalanceSapling: number;
  valueBalanceOrchard: number;
  valueBalanceIronwood: number;
  type: 'fully-shielded' | 'partial';
}

/**
 * Amount CipherScan is allowed to show for a shielded-activity row.
 *
 * For a `partial` (shield/deshield) tx, the transparent-side value balance is
 * public on-chain data — it has to be, or the transparent value pool couldn't
 * balance. Showing it isn't a privacy leak. Summed across all three pools
 * (Sapling, Orchard, Ironwood) since a tx's transparent leg can settle into
 * any of them.
 *
 * For a `fully-shielded` tx there is no transparent leg, so no amount is
 * public. We render that as a redacted placeholder rather than "0" — the
 * amount isn't zero, it's unknowable, and the UI should say so honestly.
 */
function getKnownAmount(tx: ShieldedTx): number | null {
  if (tx.type !== 'partial') return null;
  const amount = Math.abs(tx.valueBalanceSapling || 0)
    + Math.abs(tx.valueBalanceOrchard || 0)
    + Math.abs(tx.valueBalanceIronwood || 0);
  return amount > 0 ? amount : null;
}

interface RecentShieldedTxsProps {
  nested?: boolean;
  initialTxs?: ShieldedTx[];
  limit?: number;
  showLegend?: boolean;
}

export const RecentShieldedTxs = memo(function RecentShieldedTxs({
  nested = false,
  initialTxs = [],
  limit = 5,
  showLegend = true,
}: RecentShieldedTxsProps) {
  const [txs, setTxs] = useState<ShieldedTx[]>(initialTxs);
  const [loading, setLoading] = useState(initialTxs.length === 0);
  const latestKey = useRef(initialTxs[0]?.txid ?? '');
  const loadedOnce = useRef(initialTxs.length > 0);
  const latestBlockHeight = useRef(initialTxs[0]?.blockHeight ?? 0);
  const fetchRef = useRef<() => void>(() => {});

  const fetchTxs = useCallback(async () => {
    try {
      const apiUrl = usePostgresApiClient()
        ? `${getApiUrl()}/api/tx/shielded?limit=${limit}`
        : `/api/tx/shielded?limit=${limit}`;

      const response = await fetch(apiUrl);
      const data = await response.json();
      if (data.transactions?.length) {
        const newTopTxid = data.transactions[0]?.txid;
        if (newTopTxid !== latestKey.current) {
          latestKey.current = newTopTxid;
          latestBlockHeight.current = data.transactions[0]?.blockHeight ?? 0;
          setTxs(data.transactions);
        }
      }
    } catch (error) {
      console.error('Error fetching shielded transactions:', error);
    } finally {
      if (!loadedOnce.current) {
        loadedOnce.current = true;
        setLoading(false);
      }
    }
  }, [limit]);

  fetchRef.current = fetchTxs;

  const handleWsMessage = useCallback((msg: any) => {
    if (msg.type === 'new_block' || msg.type === 'chain_tip') {
      const height = msg.data?.height;
      if (height && height > latestBlockHeight.current) {
        fetchRef.current();
      }
    }
  }, []);

  const { isConnected: wsConnected } = useWebSocket({ onMessage: handleWsMessage });

  useEffect(() => {
    if (initialTxs.length === 0) {
      fetchTxs();
    }

    const interval = setInterval(fetchTxs, wsConnected ? 60000 : 10000);
    return () => clearInterval(interval);
  }, [initialTxs.length, wsConnected, fetchTxs]);

  if (loading) {
    return (
      <div className="card p-4">
        <SkeletonTable rows={5} rowHeight="h-[58px]" />
      </div>
    );
  }

  return (
    <div className={nested ? '' : 'card p-0 overflow-hidden'}>
      {/* overflow-x-auto, not overflow-hidden: never silently clip a column, scroll instead */}
      <div className="overflow-x-auto no-scrollbar">
        {/* Live-row animations — DataTable lacks per-row classes; classes mirror its conventions */}
        <table className="w-full min-w-[420px]">
          <thead>
            <tr>
              <th className="px-4 sm:px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted border-b border-cipher-border">TxID</th>
              <th className="px-4 sm:px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted border-b border-cipher-border w-12">Type</th>
              <th className="px-4 sm:px-5 py-3.5 text-right text-[11px] font-semibold uppercase tracking-wider text-muted border-b border-cipher-border">Amount</th>
              <th className="px-4 sm:px-5 py-3.5 text-right text-[11px] font-semibold uppercase tracking-wider text-muted border-b border-cipher-border">Age</th>
            </tr>
          </thead>
          <tbody>
            {txs.map((tx, i) => {
              const knownAmount = getKnownAmount(tx);
              return (
                <tr
                  key={tx.txid}
                  className="group transition-colors duration-100 hover:bg-cipher-hover animate-fade-in-up"
                  style={{ animationDelay: `${i * 30}ms` }}
                >
                  <td className="px-4 sm:px-5 h-[58px] border-b border-cipher-border">
                    <HashLink
                      value={tx.txid}
                      href={`/tx/${tx.txid}`}
                      lead={10}
                      tail={6}
                      responsive
                      accent="purple"
                      linkClassName="font-mono text-sm sm:text-base text-primary hover:text-cipher-purple transition-colors truncate"
                    />
                  </td>
                  <td className="px-4 sm:px-5 h-[58px] border-b border-cipher-border">
                    <ShieldFlowBadge
                      type={resolveShieldFlowType({
                        type: tx.type,
                        vinCount: tx.vinCount,
                        voutCount: tx.voutCount,
                      })}
                      variant="compact"
                    />
                  </td>
                  <td className="px-4 sm:px-5 h-[58px] border-b border-cipher-border text-right">
                    {knownAmount !== null ? (
                      <span className="font-mono text-sm text-secondary whitespace-nowrap">{formatZecPrecise(knownAmount)} <span className="text-muted/50">ZEC</span></span>
                    ) : (
                      <span
                        className="relative inline-block h-2.5 w-14 rounded-sm overflow-hidden bg-glass-6 align-middle"
                        title="Amount hidden — fully shielded transaction"
                        aria-label="Amount hidden — fully shielded transaction"
                        role="img"
                      >
                        <span className="absolute inset-0 shimmer" />
                      </span>
                    )}
                  </td>
                  <td className="px-4 sm:px-5 h-[58px] border-b border-cipher-border text-right">
                    <span className="text-sm text-muted whitespace-nowrap">{formatRelativeTime(tx.blockTime)}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {showLegend && <ShieldFlowLegend />}
    </div>
  );
});
