'use client';

import { useState, useEffect, memo } from 'react';
import Link from 'next/link';
import { formatRelativeTime } from '@/lib/utils';
import { getApiUrl, usePostgresApiClient } from '@/lib/api-config';
import { Badge } from '@/components/ui';

interface MempoolTx {
  txid: string;
  size: number;
  type: 'transparent' | 'shielded' | 'mixed';
  time: number;
}

function getTypeBadge(type: string) {
  switch (type) {
    case 'shielded':
      return <Badge color="purple">SHIELDED</Badge>;
    case 'mixed':
      return <Badge color="orange">MIXED</Badge>;
    default:
      return <Badge color="cyan">TRANSPARENT</Badge>;
  }
}

export const RecentMempool = memo(function RecentMempool() {
  const [txs, setTxs] = useState<MempoolTx[]>([]);
  const [loading, setLoading] = useState(true);
  const usePostgresApi = usePostgresApiClient();

  const fetchMempool = async () => {
    try {
      const apiUrl = usePostgresApi
        ? `${getApiUrl()}/api/mempool`
        : '/api/mempool';

      const response = await fetch(apiUrl);
      if (!response.ok) return;

      const result = await response.json();
      if (result.success) {
        setTxs((result.transactions || []).slice(0, 5));
      }
    } catch (error) {
      console.error('Error fetching mempool:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMempool();
    const interval = setInterval(fetchMempool, 15000);
    return () => clearInterval(interval);
  }, [usePostgresApi]);

  if (loading) {
    return (
      <div className="card p-0 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr>
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted border-b border-cipher-border">Type</th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted border-b border-cipher-border">TxID</th>
              <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-muted border-b border-cipher-border hidden sm:table-cell">Size</th>
              <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-muted border-b border-cipher-border">Age</th>
            </tr>
          </thead>
          <tbody>
            {[1, 2, 3, 4, 5].map((i) => (
              <tr key={i} className="animate-pulse">
                <td className="px-4 py-4 border-b border-cipher-border"><div className="h-4 w-20 skeleton-bg rounded" /></td>
                <td className="px-4 py-4 border-b border-cipher-border"><div className="h-4 w-28 skeleton-bg rounded" /></td>
                <td className="px-4 py-4 border-b border-cipher-border hidden sm:table-cell"><div className="h-3 w-14 skeleton-bg rounded ml-auto" /></td>
                <td className="px-4 py-4 border-b border-cipher-border"><div className="h-3 w-14 skeleton-bg rounded ml-auto" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (txs.length === 0) {
    return (
      <div className="card p-0 overflow-hidden">
        <div className="px-4 py-8 text-center text-sm text-muted font-mono">
          No pending transactions
        </div>
      </div>
    );
  }

  return (
    <div className="card p-0 overflow-hidden">
      <table className="w-full">
        <thead>
          <tr>
            <th className="px-3 sm:px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted border-b border-cipher-border">Type</th>
            <th className="px-3 sm:px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted border-b border-cipher-border">TxID</th>
            <th className="px-3 sm:px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-muted border-b border-cipher-border hidden sm:table-cell">Size</th>
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
                {getTypeBadge(tx.type)}
              </td>
              <td className="px-3 sm:px-4 h-[52px] border-b border-cipher-border">
                <Link href={`/tx/${tx.txid}`} className="font-mono text-xs sm:text-sm font-normal text-primary group-hover:text-cipher-cyan transition-colors truncate block max-w-[120px] sm:max-w-none">
                  <span className="sm:hidden">{tx.txid.slice(0, 6)}...{tx.txid.slice(-4)}</span>
                  <span className="hidden sm:inline">{tx.txid.slice(0, 10)}...{tx.txid.slice(-6)}</span>
                </Link>
              </td>
              <td className="px-3 sm:px-4 h-[52px] border-b border-cipher-border text-right hidden sm:table-cell">
                <span className="font-mono text-xs text-muted">{(tx.size / 1024).toFixed(2)} KB</span>
              </td>
              <td className="px-3 sm:px-4 h-[52px] border-b border-cipher-border text-right">
                <span className="text-xs sm:text-sm text-muted whitespace-nowrap">{formatRelativeTime(tx.time)}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});
