'use client';

import { useState, useEffect, useCallback, memo } from 'react';
import { formatRelativeTime } from '@/lib/utils';
import { getApiUrl, usePostgresApiClient } from '@/lib/api-config';
import { useWebSocket } from '@/hooks/useWebSocket';
import { Badge, HashLink, SkeletonTable } from '@/components/ui';

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

function classifyTxType(tx: any): 'shielded' | 'mixed' | 'transparent' {
  const hasShielded = tx.hasOrchard || tx.hasSapling || tx.hasIronwood;
  const hasTransparent = (tx.inputCount || 0) > 0 || (tx.outputCount || 0) > 0;
  if (hasShielded && hasTransparent) return 'mixed';
  if (hasShielded) return 'shielded';
  return 'transparent';
}

export const RecentMempool = memo(function RecentMempool() {
  const [txs, setTxs] = useState<MempoolTx[]>([]);
  const [loading, setLoading] = useState(true);
  const usePostgresApi = usePostgresApiClient();

  const handleWsMessage = useCallback((msg: any) => {
    if (msg.type === 'mempool_tx' && msg.data?.txid) {
      const tx: MempoolTx = {
        txid: msg.data.txid,
        size: msg.data.size || 0,
        type: classifyTxType(msg.data),
        time: msg.data.time || Math.floor(Date.now() / 1000),
      };
      setTxs(prev => [tx, ...prev].slice(0, 5));
      setLoading(false);
    } else if (msg.type === 'mempool_removed' && msg.data?.txid) {
      setTxs(prev => prev.filter(t => t.txid !== msg.data.txid));
    }
  }, []);

  useWebSocket({ onMessage: handleWsMessage });

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
    // Slower fallback polling — WebSocket handles real-time updates
    const interval = setInterval(fetchMempool, 30000);
    return () => clearInterval(interval);
  }, [usePostgresApi]);

  if (loading) {
    return (
      <div className="card p-4">
        <SkeletonTable rows={5} rowHeight="h-[52px]" />
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
      {/* Live-row animations — DataTable lacks per-row classes; classes mirror its conventions */}
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
          {txs.map((tx, i) => (
            <tr
              key={tx.txid}
              className="group transition-colors duration-100 hover:bg-cipher-hover animate-fade-in-up"
              style={{ animationDelay: `${i * 30}ms` }}
            >
              <td className="px-4 h-[52px] border-b border-cipher-border">
                {getTypeBadge(tx.type)}
              </td>
              <td className="px-4 h-[52px] border-b border-cipher-border">
                <HashLink value={tx.txid} href={`/tx/${tx.txid}`} lead={10} tail={6} responsive />
              </td>
              <td className="px-4 h-[52px] border-b border-cipher-border text-right hidden sm:table-cell">
                <span className="font-mono text-xs text-muted">{(tx.size / 1024).toFixed(2)} KB</span>
              </td>
              <td className="px-4 h-[52px] border-b border-cipher-border text-right">
                <span className="text-xs sm:text-sm text-muted whitespace-nowrap">{formatRelativeTime(tx.time)}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});
