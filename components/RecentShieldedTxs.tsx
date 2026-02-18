'use client';

import { useState, useEffect } from 'react';
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
  nested?: boolean; // When inside another card, use transparent bg
}

export function RecentShieldedTxs({ nested = false }: RecentShieldedTxsProps) {
  const [txs, setTxs] = useState<ShieldedTx[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTxs = async () => {
      try {
        const apiUrl = usePostgresApiClient()
          ? `${getApiUrl()}/api/tx/shielded?limit=5`
          : '/api/tx/shielded?limit=5';

        const response = await fetch(apiUrl);
        const data = await response.json();
        if (data.transactions) {
          setTxs(data.transactions);
        }
      } catch (error) {
        console.error('Error fetching shielded transactions:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchTxs();

    // Set up polling for live updates
    const interval = setInterval(fetchTxs, 10000); // Update every 10s
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="card card-compact animate-pulse">
            <div className="flex justify-between items-center">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="h-5 w-28 skeleton-bg rounded" />
                  <div className="h-4 w-20 skeleton-bg rounded" />
                </div>
                <div className="h-3 w-32 skeleton-bg rounded" />
              </div>
              <div className="space-y-2 text-right">
                <div className="h-4 w-20 skeleton-bg rounded ml-auto" />
                <div className="h-3 w-28 skeleton-bg rounded ml-auto" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Helper to determine badge
  const getTxBadge = (tx: ShieldedTx) => {
    if (tx.type === 'fully-shielded') {
      return <Badge color="purple">SHIELDED</Badge>;
    } else if (tx.vinCount > 0 && tx.voutCount === 0) {
      return <Badge color="green">↓ SHIELDING</Badge>;
    } else if (tx.vinCount === 0 && tx.voutCount > 0) {
      return <Badge color="orange">↑ UNSHIELDING</Badge>;
    } else {
      return <Badge color="orange">MIXED</Badge>;
    }
  };

  return (
    <div className="space-y-3">
      {txs.map((tx, index) => (
        <Link href={`/tx/${tx.txid}`} key={tx.txid}>
          <div
            className={`card card-compact card-interactive group animate-fade-in-up ${
              nested ? 'bg-transparent' : ''
            }`}
            style={{
              animationDelay: `${index * 50}ms`,
              borderColor: nested ? 'rgba(168, 85, 247, 0.2)' : undefined
            }}
          >
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
              <div className="flex-1">
                <div className="flex items-center space-x-3 mb-2">
                  <span className="w-6 h-6 flex items-center justify-center rounded-md bg-purple-500/10">
                    <svg className="w-4 h-4 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                  </span>
                  <h3 className="text-base sm:text-lg font-bold font-mono text-purple-400 group-hover:text-purple-300 transition-colors">
                    {tx.txid.slice(0, 12)}...
                  </h3>
                  {getTxBadge(tx)}
                </div>
                <div className="text-xs text-muted font-mono">
                  <span className="opacity-50">Block: </span>
                  <code className="break-all">#{tx.blockHeight.toLocaleString()}</code>
                  {tx.hasOrchard && (
                    <span className="ml-2 text-[10px] text-purple-400">
                      {tx.orchardActions} Orchard
                    </span>
                  )}
                  {tx.hasSapling && (
                    <span className="ml-2 text-[10px] text-purple-400">
                      {tx.shieldedSpends || tx.shieldedOutputs} Sapling
                    </span>
                  )}
                </div>
              </div>
              <div className="text-left sm:text-right sm:ml-6">
                <div className="text-sm text-secondary font-mono">
                  {formatRelativeTime(tx.blockTime)}
                </div>
                <div className="text-xs text-muted mt-1 suppress-hydration-warning">
                  {new Date(tx.blockTime * 1000).toLocaleString('en-US', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: false
                  })}
                </div>
              </div>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
