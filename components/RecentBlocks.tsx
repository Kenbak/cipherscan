'use client';

import { useState, useEffect, useRef, memo, useCallback } from 'react';
import Link from 'next/link';
import { formatRelativeTime } from '@/lib/utils';
import { formatBytesCompact } from '@/lib/format-numbers';
import { usePostgresApiClient, getApiUrl } from '@/lib/api-config';
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

export const RecentBlocks = memo(function RecentBlocks({ initialBlocks = [] }: RecentBlocksProps) {
  const [blocks, setBlocks] = useState<Block[]>(initialBlocks);
  const [loading, setLoading] = useState(initialBlocks.length === 0);
  const latestKey = useRef(initialBlocks[0]?.height ?? 0);
  const loadedOnce = useRef(initialBlocks.length > 0);
  const fetchRef = useRef<() => void>(() => {});

  const fetchLatest = useCallback(async () => {
    try {
      const apiUrl = usePostgresApiClient()
        ? `${getApiUrl()}/api/blocks?limit=5`
        : '/api/blocks?limit=5';

      const response = await fetch(apiUrl);
      const data = await response.json();
      if (data.blocks?.length) {
        const newTopHeight = parseInt(data.blocks[0]?.height ?? data.blocks[0]?.block_height);
        if (newTopHeight !== latestKey.current) {
          latestKey.current = newTopHeight;
          setBlocks(data.blocks.map(parseBlock));
        }
      }
    } catch (error) {
      console.error('Error fetching blocks:', error);
    } finally {
      if (!loadedOnce.current) {
        loadedOnce.current = true;
        setLoading(false);
      }
    }
  }, []);

  fetchRef.current = fetchLatest;

  const handleWsMessage = useCallback((msg: any) => {
    if (msg.type === 'new_block' && msg.data?.height) {
      const newBlock = parseBlock(msg.data);
      if (newBlock.height > latestKey.current) {
        latestKey.current = newBlock.height;
        setBlocks(prev => [newBlock, ...prev].slice(0, 5));
        setLoading(false);
      }
    } else if (msg.type === 'chain_tip' && msg.data?.height) {
      if (msg.data.height > latestKey.current) {
        fetchRef.current();
      }
    }
  }, []);

  const { isConnected: wsConnected } = useWebSocket({ onMessage: handleWsMessage });

  useEffect(() => {
    if (initialBlocks.length === 0) {
      fetchLatest();
    }

    const interval = setInterval(fetchLatest, wsConnected ? 60000 : 10000);
    return () => clearInterval(interval);
  }, [initialBlocks.length, wsConnected, fetchLatest]);

  if (loading) {
    return (
      <div className="card p-4">
        <SkeletonTable rows={5} rowHeight="h-[58px]" />
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
              <th className="px-4 sm:px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted border-b border-cipher-border">Block</th>
              <th className="px-4 sm:px-5 py-3.5 text-right text-[11px] font-semibold uppercase tracking-wider text-muted border-b border-cipher-border">Size</th>
              <th className="px-4 sm:px-5 py-3.5 text-right text-[11px] font-semibold uppercase tracking-wider text-muted border-b border-cipher-border">TXs</th>
              <th className="px-4 sm:px-5 py-3.5 text-right text-[11px] font-semibold uppercase tracking-wider text-muted border-b border-cipher-border">Age</th>
            </tr>
          </thead>
          <tbody>
            {blocks.map((block, i) => (
              <tr
                key={block.height}
                className="group transition-colors duration-100 hover:bg-cipher-hover animate-fade-in-up"
                style={{ animationDelay: `${i * 30}ms` }}
              >
                <td className="px-4 sm:px-5 h-[58px] border-b border-cipher-border">
                  <Link href={`/block/${block.height}`} className="font-mono text-sm sm:text-base font-normal text-primary group-hover:text-cipher-cyan transition-colors">
                    #{block.height.toLocaleString()}
                  </Link>
                </td>
                <td className="px-4 sm:px-5 h-[58px] border-b border-cipher-border text-right">
                  <span className="font-mono text-xs text-muted whitespace-nowrap">{block.size > 0 ? formatBytesCompact(block.size) : '—'}</span>
                </td>
                <td className="px-4 sm:px-5 h-[58px] border-b border-cipher-border text-right">
                  <span className="font-mono text-sm sm:text-base text-primary">{block.transactions}</span>
                </td>
                <td className="px-4 sm:px-5 h-[58px] border-b border-cipher-border text-right">
                  <span className="text-sm text-muted whitespace-nowrap">{formatRelativeTime(block.timestamp)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
});
