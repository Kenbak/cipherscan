'use client';

import { useState, useEffect, useRef, memo } from 'react';
import { formatRelativeTime } from '@/lib/utils';
import { usePostgresApiClient, getApiUrl } from '@/lib/api-config';
import { ShieldFlowBadge, ShieldFlowLegend } from '@/components/ShieldFlowBadge';
import { resolveShieldFlowType } from '@/components/icons/shield-flow';
import { HashLink, SkeletonTable } from '@/components/ui';

interface ShieldedTx {
  txid: string;
  blockHeight: number;
  blockTime: number;
  hasSapling: boolean;
  hasOrchard: boolean;
  shieldedSpends: number;
  shieldedOutputs: number;
  orchardActions: number;
  vinCount: number;
  voutCount: number;
  type: 'fully-shielded' | 'partial';
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

  useEffect(() => {
    const fetchTxs = async () => {
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
    };

    if (initialTxs.length === 0) {
      fetchTxs();
    }

    const interval = setInterval(fetchTxs, 10000);
    return () => clearInterval(interval);
  }, [initialTxs.length, limit]);

  if (loading) {
    return (
      <div className="card p-4">
        <SkeletonTable rows={5} rowHeight="h-[52px]" />
      </div>
    );
  }

  return (
    <div className={nested ? '' : 'card p-0 overflow-hidden'}>
      {/* Live-row animations — DataTable lacks per-row classes; classes mirror its conventions */}
      <table className="w-full">
        <thead>
          <tr>
            <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted border-b border-cipher-border">TxID</th>
            <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted border-b border-cipher-border w-12">Type</th>
            <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-muted border-b border-cipher-border hidden sm:table-cell">Block</th>
            <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-muted border-b border-cipher-border">Age</th>
          </tr>
        </thead>
        <tbody>
          {txs.map((tx, i) => (
            <tr
              key={tx.txid}
              className="group transition-colors duration-100 hover:bg-cipher-hover animate-fade-in-up"
              style={{ animationDelay: `${i * 30}ms` }}
            >
              <td className="px-4 h-[52px] border-b border-cipher-border">
                <HashLink value={tx.txid} href={`/tx/${tx.txid}`} lead={10} tail={6} responsive accent="purple" />
              </td>
              <td className="px-4 h-[52px] border-b border-cipher-border">
                <ShieldFlowBadge
                  type={resolveShieldFlowType({
                    type: tx.type,
                    vinCount: tx.vinCount,
                    voutCount: tx.voutCount,
                  })}
                  variant="compact"
                />
              </td>
              <td className="px-4 h-[52px] border-b border-cipher-border text-right hidden sm:table-cell">
                <span className="font-mono text-xs text-muted">#{tx.blockHeight.toLocaleString()}</span>
              </td>
              <td className="px-4 h-[52px] border-b border-cipher-border text-right">
                <span className="text-xs sm:text-sm text-muted whitespace-nowrap">{formatRelativeTime(tx.blockTime)}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {showLegend && <ShieldFlowLegend />}
    </div>
  );
});
