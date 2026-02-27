'use client';

import { useState, useEffect, useRef, memo } from 'react';
import Link from 'next/link';
import { formatRelativeTime } from '@/lib/utils';
import { usePostgresApiClient, getApiUrl } from '@/lib/api-config';
import { Badge } from '@/components/ui';

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
}

function getTxBadge(tx: ShieldedTx) {
  if (tx.type === 'fully-shielded') return <Badge color="purple">SHIELDED</Badge>;
  if (tx.vinCount > 0 && tx.voutCount === 0) return <Badge color="green">↓ SHIELDING</Badge>;
  if (tx.vinCount === 0 && tx.voutCount > 0) return <Badge color="orange">↑ UNSHIELDING</Badge>;
  return <Badge color="orange">MIXED</Badge>;
}

export const RecentShieldedTxs = memo(function RecentShieldedTxs({ nested = false, initialTxs = [] }: RecentShieldedTxsProps) {
  const [txs, setTxs] = useState<ShieldedTx[]>(initialTxs);
  const [loading, setLoading] = useState(initialTxs.length === 0);
  const latestKey = useRef(initialTxs[0]?.txid ?? '');
  const loadedOnce = useRef(initialTxs.length > 0);

  useEffect(() => {
    const fetchTxs = async () => {
      try {
        const apiUrl = usePostgresApiClient()
          ? `${getApiUrl()}/api/tx/shielded?limit=5`
          : '/api/tx/shielded?limit=5';

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
  }, [initialTxs.length]);

  if (loading) {
    return (
      <div className="card p-0 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr>
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted border-b border-cipher-border">TxID</th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted border-b border-cipher-border">Type</th>
              <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-muted border-b border-cipher-border hidden sm:table-cell">Block</th>
              <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-muted border-b border-cipher-border">Age</th>
            </tr>
          </thead>
          <tbody>
            {[1, 2, 3, 4, 5].map((i) => (
              <tr key={i} className="animate-pulse">
                <td className="px-4 py-4 border-b border-cipher-border"><div className="h-4 w-28 skeleton-bg rounded" /></td>
                <td className="px-4 py-4 border-b border-cipher-border"><div className="h-4 w-20 skeleton-bg rounded" /></td>
                <td className="px-4 py-4 border-b border-cipher-border hidden sm:table-cell"><div className="h-3 w-16 skeleton-bg rounded ml-auto" /></td>
                <td className="px-4 py-4 border-b border-cipher-border"><div className="h-3 w-14 skeleton-bg rounded ml-auto" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="card p-0 overflow-hidden">
      <table className="w-full">
        <thead>
          <tr>
            <th className="px-3 sm:px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted border-b border-cipher-border">TxID</th>
            <th className="px-3 sm:px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted border-b border-cipher-border">Type</th>
            <th className="px-3 sm:px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-muted border-b border-cipher-border hidden sm:table-cell">Block</th>
            <th className="px-3 sm:px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-muted border-b border-cipher-border">Age</th>
          </tr>
        </thead>
        <tbody>
          {txs.map((tx, i) => (
            <tr
              key={tx.txid}
              className="group transition-colors duration-100 hover:bg-[var(--color-hover)] animate-fade-in-up"
              style={{ animationDelay: `${i * 30}ms` }}
            >
              <td className="px-3 sm:px-4 h-[52px] border-b border-cipher-border">
                <Link href={`/tx/${tx.txid}`} className="font-mono text-xs sm:text-sm font-normal text-primary group-hover:text-cipher-purple transition-colors truncate block max-w-[120px] sm:max-w-none">
                  <span className="sm:hidden">{tx.txid.slice(0, 6)}...{tx.txid.slice(-4)}</span>
                  <span className="hidden sm:inline">{tx.txid.slice(0, 10)}...{tx.txid.slice(-6)}</span>
                </Link>
              </td>
              <td className="px-3 sm:px-4 h-[52px] border-b border-cipher-border">
                {getTxBadge(tx)}
              </td>
              <td className="px-3 sm:px-4 h-[52px] border-b border-cipher-border text-right hidden sm:table-cell">
                <span className="font-mono text-xs text-muted">#{tx.blockHeight.toLocaleString()}</span>
              </td>
              <td className="px-3 sm:px-4 h-[52px] border-b border-cipher-border text-right">
                <span className="text-xs sm:text-sm text-muted whitespace-nowrap">{formatRelativeTime(tx.blockTime)}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});
