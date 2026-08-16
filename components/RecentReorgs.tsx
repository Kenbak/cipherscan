'use client';

import { useState, useEffect, useRef, memo, useCallback, type ReactNode } from 'react';
import Link from 'next/link';
import { formatRelativeTime } from '@/lib/utils';
import { usePostgresApiClient, getApiUrl } from '@/lib/api-config';
import { useWebSocket } from '@/hooks/useWebSocket';
import { SkeletonTable } from '@/components/ui';

interface Fork {
  id: number;
  forkHeight: number;
  depth: number;
  orphanedCount: number;
  detectedAt: string;
}

function toUnixSeconds(iso: string): number {
  return Math.floor(new Date(iso).getTime() / 1000);
}

/**
 * Homepage-sized "recent forks/reorgs" widget — same card/table/footer shape
 * as RecentBlocks/RecentShieldedTxs/RecentTransactions, just a different
 * feed. Reuses /api/uncles/forks (the same endpoint /reorgs itself uses),
 * limited to 5 rows here instead of that page's full history.
 */
export const RecentReorgs = memo(function RecentReorgs({ footer }: { footer?: ReactNode } = {}) {
  const [forks, setForks] = useState<Fork[]>([]);
  const [loading, setLoading] = useState(true);
  const latestKey = useRef<number | null>(null);
  const loadedOnce = useRef(false);
  const fetchRef = useRef<() => void>(() => {});

  const fetchLatest = useCallback(async () => {
    try {
      const apiUrl = usePostgresApiClient()
        ? `${getApiUrl()}/api/uncles/forks?limit=5`
        : '/api/uncles/forks?limit=5';

      const response = await fetch(apiUrl);
      const data = await response.json();
      if (data.success && Array.isArray(data.forks)) {
        const newTop = data.forks[0]?.id ?? null;
        if (newTop !== latestKey.current) {
          latestKey.current = newTop;
          setForks(data.forks);
        }
      }
    } catch (error) {
      console.error('Error fetching recent forks:', error);
    } finally {
      if (!loadedOnce.current) {
        loadedOnce.current = true;
        setLoading(false);
      }
    }
  }, []);

  fetchRef.current = fetchLatest;

  const handleWsMessage = useCallback((msg: any) => {
    if (msg.type === 'new_block' || msg.type === 'chain_tip') {
      fetchRef.current();
    }
  }, []);

  const { isConnected: wsConnected } = useWebSocket({ onMessage: handleWsMessage });

  useEffect(() => {
    fetchLatest();
    const interval = setInterval(fetchLatest, wsConnected ? 60000 : 30000);
    return () => clearInterval(interval);
  }, [wsConnected, fetchLatest]);

  if (loading) {
    return (
      <div className="card p-4">
        <SkeletonTable rows={5} rowHeight="h-12" />
      </div>
    );
  }

  if (forks.length === 0) {
    return (
      <div className="card p-0 overflow-hidden">
        <div className="px-4 py-8 text-center text-sm text-muted font-mono">
          No recent forks or reorgs
        </div>
        {footer && <div className="px-4 py-3 border-t border-cipher-border text-center">{footer}</div>}
      </div>
    );
  }

  return (
    <div className="card p-0 overflow-hidden">
      {/* overflow-x-auto, not overflow-hidden: never silently clip a column, scroll instead */}
      <div className="overflow-x-auto no-scrollbar">
        {/* Live-row animations — DataTable lacks per-row classes; classes mirror its conventions */}
        <table className="w-full min-w-[420px]">
          <thead>
            <tr>
              <th className="px-4 sm:px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted border-b border-cipher-border">Height</th>
              <th className="px-4 sm:px-5 py-3.5 text-right text-[11px] font-semibold uppercase tracking-wider text-muted border-b border-cipher-border">Depth</th>
              <th className="px-4 sm:px-5 py-3.5 text-right text-[11px] font-semibold uppercase tracking-wider text-muted border-b border-cipher-border">Orphaned</th>
              <th className="px-4 sm:px-5 py-3.5 text-right text-[11px] font-semibold uppercase tracking-wider text-muted border-b border-cipher-border">Age</th>
            </tr>
          </thead>
          <tbody>
            {forks.map((fork, i) => (
              <tr
                key={fork.id}
                className="group transition-colors duration-100 hover:bg-cipher-hover animate-fade-in-up"
                style={{ animationDelay: `${i * 30}ms` }}
              >
                <td className="px-4 sm:px-5 h-12 border-b border-cipher-border">
                  <Link href={`/block/${fork.forkHeight}`} className="font-mono text-sm font-medium text-primary hover:underline transition-colors tabular-nums">
                    #{fork.forkHeight.toLocaleString()}
                  </Link>
                </td>
                <td className="px-4 sm:px-5 h-12 border-b border-cipher-border text-right">
                  <span className="font-mono text-sm text-cipher-orange tabular-nums">{fork.depth}</span>
                </td>
                <td className="px-4 sm:px-5 h-12 border-b border-cipher-border text-right">
                  <span className="font-mono text-xs text-muted tabular-nums">{fork.orphanedCount}</span>
                </td>
                <td className="px-4 sm:px-5 h-12 border-b border-cipher-border text-right">
                  <span className="text-sm text-muted whitespace-nowrap">{formatRelativeTime(toUnixSeconds(fork.detectedAt))}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {footer && <div className="px-4 py-3 border-t border-cipher-border text-center">{footer}</div>}
    </div>
  );
});
