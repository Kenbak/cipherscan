'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { getApiUrl, usePostgresApiClient } from '@/lib/api-config';
import { useWebSocket } from '@/hooks/useWebSocket';
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
  ironwoodActions?: number;
  totalOutput?: number;
}

export default function MempoolLiveClient() {
  const [transactions, setTransactions] = useState<MempoolTransaction[]>([]);
  const [stats, setStats] = useState<{ total: number; shieldedPct: number }>({ total: 0, shieldedPct: 0 });
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
        setTransactions(result.transactions);
        setStats({
          total: result.count,
          shieldedPct: Math.round(result.stats?.shieldedPercentage ?? 0),
        });
      }
    } catch {}
  };

  const handleWsMessage = useCallback((msg: any) => {
    if (msg.type === 'mempool_tx' && msg.data?.txid) {
      setTransactions(prev => {
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
          totalOutput: msg.data.totalOutput,
        };
        const txs = [newTx, ...prev.filter(t => t.txid !== msg.data.txid)];
        setStats(s => ({ ...s, total: txs.length }));
        return txs;
      });
    } else if (msg.type === 'mempool_removed' && msg.data?.txid) {
      setTransactions(prev => {
        const txs = prev.filter(t => t.txid !== msg.data.txid);
        setStats(s => ({ ...s, total: txs.length }));
        return txs;
      });
    }
  }, []);

  useWebSocket({ onMessage: handleWsMessage });

  useEffect(() => {
    fetchMempool();
    const interval = setInterval(fetchMempool, 30000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  return (
    <div className="fixed inset-0 z-[9999] bg-[#08090f] group/live">
      <MempoolBubbles
        transactions={transactions}
        className="h-full"
        ambient
        stats={stats}
      />

      {/* Back to mempool — visible on hover/mouse movement */}
      <Link
        href="/mempool"
        className="absolute top-5 left-5 z-50 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/40 hover:text-white hover:bg-white/10 transition-all duration-300 opacity-0 group-hover/live:opacity-100 font-mono text-[11px] tracking-wider"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
        EXIT
      </Link>
    </div>
  );
}
