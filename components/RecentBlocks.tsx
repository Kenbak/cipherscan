'use client';

import { readApiData } from '@/lib/api-client';
import { useState, useEffect, useRef, memo, useCallback, type ReactNode } from 'react';
import { fetchLiveResponse, startLiveRefresh } from '@/lib/live-refresh';
import { LiveRefreshStatus } from '@/components/LiveRefreshStatus';
import Link from 'next/link';
import { formatBytesCompact } from '@/lib/format-numbers';
import { RelativeTime } from '@/components/RelativeTime';
import { getApiUrl } from '@/lib/api-config';
import { useWebSocket } from '@/hooks/useWebSocket';
import { SkeletonTable } from '@/components/ui';

interface Block {
  height: number;
  hash: string;
  timestamp: number;
  transactions: number;
  size: number;
  finality?: string | null;
}

interface RecentBlocksProps {
  initialBlocks?: Block[];
  /** Rendered inside the card, below the table (e.g. a "View all" link) — same slot DataTable's own `footer` prop fills. */
  footer?: ReactNode;
}

function parseBlock(b: any): Block {
  return {
    height: parseInt(b.height ?? b.block_height),
    hash: b.hash,
    timestamp: parseInt(b.timestamp ?? b.block_time),
    transactions: parseInt(b.transaction_count ?? b.transactions ?? 0),
    size: parseInt(b.size ?? 0),
  };
}

export const RecentBlocks = memo(function RecentBlocks({ initialBlocks = [], footer }: RecentBlocksProps) {
  const [blocks, setBlocks] = useState<Block[]>(initialBlocks);
  const [loading, setLoading] = useState(initialBlocks.length === 0);
  const inFlight = useRef(false);
  const [lastCheckedAt, setLastCheckedAt] = useState<number | null>(null);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const loadedOnce = useRef(initialBlocks.length > 0);
  const fetchRef = useRef<() => void>(() => {});

  const fetchLatest = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const apiUrl = `${getApiUrl()}/v1/blocks?limit=5`;

      const data = await fetchLiveResponse(apiUrl, readApiData<any[]>);
      if (!Array.isArray(data) || !data.length) {
        throw new Error('Block data unavailable');
      }
      setBlocks(data.map(parseBlock));
      setLastCheckedAt(Date.now());
      setRefreshFailed(false);
    } catch (error) {
      setRefreshFailed(true);
      console.error('Error fetching blocks:', error);
    } finally {
      inFlight.current = false;
      if (!loadedOnce.current) {
        loadedOnce.current = true;
        setLoading(false);
      }
    }
  }, []);

  fetchRef.current = fetchLatest;

  const handleWsMessage = useCallback((msg: any) => {
    if (msg.type === 'new_block' || msg.type === 'chain_tip') {
      void fetchRef.current();
    }
  }, []);

  useWebSocket({ onMessage: handleWsMessage, onConnect: fetchLatest });

  useEffect(() => startLiveRefresh(fetchLatest), [fetchLatest]);

  if (loading) {
    return (
      <div className="card p-0 overflow-hidden">
        <SkeletonTable rows={5} rowHeight="h-12" headers={["Block", "Size", "TXs", "Age"]} />
        {footer && <div className="px-4 py-3 border-t border-cipher-border text-center">{footer}</div>}
      </div>
    );
  }

  return (
    <div className="card p-0 overflow-hidden">
      <LiveRefreshStatus lastCheckedAt={lastCheckedAt} failed={refreshFailed} />
      {/* overflow-x-auto, not overflow-hidden: never silently clip a column, scroll instead */}
      <div className="overflow-x-auto no-scrollbar">
        {/* Live-row animations — DataTable lacks per-row classes; classes mirror its conventions */}
        <table className="w-full min-w-[420px]">
          <thead>
            <tr>
              <th className="px-4 sm:px-5 py-3.5 text-left text-caption font-semibold uppercase tracking-wider text-muted border-b border-cipher-border">Block</th>
              <th className="px-4 sm:px-5 py-3.5 text-right text-caption font-semibold uppercase tracking-wider text-muted border-b border-cipher-border">Size</th>
              <th className="px-4 sm:px-5 py-3.5 text-right text-caption font-semibold uppercase tracking-wider text-muted border-b border-cipher-border">TXs</th>
              <th className="px-4 sm:px-5 py-3.5 text-right text-caption font-semibold uppercase tracking-wider text-muted border-b border-cipher-border">Age</th>
            </tr>
          </thead>
          <tbody>
            {blocks.map((block, i) => (
              <tr
                key={block.height}
                className="group transition-colors duration-100 hover:bg-cipher-hover animate-fade-in-up"
                style={{ animationDelay: `${i * 30}ms` }}
              >
                <td className="px-4 sm:px-5 h-12 border-b border-cipher-border">
                  <Link href={`/block/${block.height}`} className="font-mono text-sm font-medium text-primary group-hover:text-primary transition-colors tabular-nums">
                    #{block.height.toLocaleString()}
                  </Link>
                </td>
                <td className="px-4 sm:px-5 h-12 border-b border-cipher-border text-right">
                  <span className="font-mono text-xs text-muted whitespace-nowrap tabular-nums">{block.size > 0 ? formatBytesCompact(block.size) : '—'}</span>
                </td>
                <td className="px-4 sm:px-5 h-12 border-b border-cipher-border text-right">
                  <span className="font-mono text-sm text-primary tabular-nums">{block.transactions}</span>
                </td>
                <td className="px-4 sm:px-5 h-12 border-b border-cipher-border text-right">
                  <RelativeTime timestamp={block.timestamp} className="text-sm text-muted whitespace-nowrap" />
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
