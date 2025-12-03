'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { formatRelativeTime } from '@/lib/utils';
import { usePostgresApiClient, getApiUrl } from '@/lib/api-config';

interface ShieldedTx {
  txid: string;
  blockHeight: number;
  blockTime: number;
  hasSapling: boolean;
  hasOrchard: boolean;
  shieldedSpends: number;
  shieldedOutputs: number;
  orchardActions: number;
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
      <div className="card">
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-400"></div>
          <p className="text-gray-400 ml-4 font-mono text-lg">Loading shielded data...</p>
        </div>
      </div>
    );
  }

  const Icons = {
    Shield: () => (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
  };

  return (
    <div className="space-y-4">
      {txs.map((tx, index) => (
        <Link href={`/tx/${tx.txid}`} key={tx.txid}>
          <div
            className={`card ${nested ? '!bg-transparent border-purple-500/20 hover:border-purple-500/50' : 'hover:border-purple-500'} transition-all cursor-pointer group animate-slide-up`}
            style={{ animationDelay: `${index * 100}ms` }}
          >
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
              <div className="flex-1">
                <div className="flex items-center space-x-3 mb-3">
                  <span className="text-2xl">🔒</span>
                  <h3 className="text-lg font-bold font-mono text-purple-400 group-hover:text-purple-300 transition-colors">
                    {tx.txid.slice(0, 12)}...
                  </h3>
                  {tx.type === 'fully-shielded' ? (
                    <span className="badge bg-purple-500/10 text-purple-400 border-purple-500/30">
                      FULLY SHIELDED
                    </span>
                  ) : (
                    <span className="badge bg-yellow-500/10 text-yellow-400 border-yellow-500/30">
                      MIXED
                    </span>
                  )}
                </div>
                <div className="text-xs text-gray-500 font-mono mt-2">
                  <span className="opacity-50">Block: </span>
                  <code className="break-all">#{tx.blockHeight.toLocaleString()}</code>
                  {tx.hasOrchard && (
                    <span className="ml-2 text-[10px] text-purple-400">
                      {tx.orchardActions} Orchard
                    </span>
                  )}
                  {tx.hasSapling && (
                    <span className="ml-2 text-[10px] text-blue-400">
                      {tx.shieldedSpends || tx.shieldedOutputs} Sapling
                    </span>
                  )}
                </div>
              </div>
              <div className="text-left sm:text-right sm:ml-6">
                <div className="text-sm text-gray-400 font-mono">
                  {formatRelativeTime(tx.blockTime)}
                </div>
                <div className="text-xs text-gray-500 mt-1 suppress-hydration-warning">
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
