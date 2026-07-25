'use client';

import { useState, useEffect, useRef, memo, useCallback } from 'react';
import Link from 'next/link';
import { formatRelativeTime } from '@/lib/utils';
import { usePostgresApiClient, getApiUrl } from '@/lib/api-config';
import { useWebSocket } from '@/hooks/useWebSocket';
import { HashLink, SkeletonTable } from '@/components/ui';

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

  const handleWsMessage = useCallback((msg: any) => {
    if (msg.type === 'new_block' && msg.data?.height) {
      const newBlock = parseBlock(msg.data);
      if (newBlock.height > latestKey.current) {
        latestKey.current = newBlock.height;
        setBlocks(prev => [newBlock, ...prev].slice(0, 5));
        setLoading(false);
      }
    }
  }, []);

  const { isConnected: wsConnected } = useWebSocket({ onMessage: handleWsMessage });

  useEffect(() => {
    const fetchBlocks = async () => {
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
    };

    if (initialBlocks.length === 0) {
      fetchBlocks();
    }

    const interval = setInterval(fetchBlocks, wsConnected ? 60000 : 10000);
    return () => clearInterval(interval);
  }, [initialBlocks.length, wsConnected]);

  if (loading) {
    return (
      <div className="card p-4">
        <SkeletonTable rows={5} rowHeight="h-[52px]" />
      </div>
    );
  }

  return (
    <div className="card p-0 overflow-hidden">
      {/* Live-row animations — DataTable lacks per-row classes; classes mirror its conventions */}
      <table className="w-full">
        <thead>
          <tr>
            <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted border-b border-cipher-border">Block</th>
            <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted border-b border-cipher-border hidden sm:table-cell">Hash</th>
            <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-muted border-b border-cipher-border">TXs</th>
            <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-muted border-b border-cipher-border">Age</th>
          </tr>
        </thead>
        <tbody>
          {blocks.map((block, i) => (
            <tr
              key={block.height}
              className="group transition-colors duration-100 hover:bg-cipher-hover animate-fade-in-up"
              style={{ animationDelay: `${i * 30}ms` }}
            >
              <td className="px-4 h-[52px] border-b border-cipher-border">
                <Link href={`/block/${block.height}`} className="font-mono text-xs sm:text-sm font-normal text-primary group-hover:text-cipher-cyan transition-colors">
                  #{block.height.toLocaleString()}
                </Link>
              </td>
              <td className="px-4 h-[52px] border-b border-cipher-border hidden sm:table-cell">
                <HashLink value={block.hash} lead={8} tail={6} linkClassName="font-mono text-xs text-muted" />
              </td>
              <td className="px-4 h-[52px] border-b border-cipher-border text-right">
                <span className="font-mono text-xs sm:text-sm text-primary">{block.transactions}</span>
              </td>
              <td className="px-4 h-[52px] border-b border-cipher-border text-right">
                <span className="text-xs sm:text-sm text-muted whitespace-nowrap">{formatRelativeTime(block.timestamp)}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});
