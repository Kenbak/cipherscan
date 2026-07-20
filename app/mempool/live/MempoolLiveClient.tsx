'use client';

import { useState, useEffect, useCallback } from 'react';
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
    <div className="fixed inset-0 z-[9999] bg-[#08090f]">
      <MempoolBubbles
        transactions={transactions}
        className="h-full"
        ambient
        stats={stats}
      />
    </div>
  );
}
