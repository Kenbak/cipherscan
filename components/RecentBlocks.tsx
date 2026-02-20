'use client';

import { useState, useEffect, useRef, memo } from 'react';
import Link from 'next/link';
import { formatRelativeTime } from '@/lib/utils';
import { usePostgresApiClient, getApiUrl } from '@/lib/api-config';
import { Badge } from '@/components/ui';

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

export const RecentBlocks = memo(function RecentBlocks({ initialBlocks = [] }: RecentBlocksProps) {
  const [blocks, setBlocks] = useState<Block[]>(initialBlocks);
  const [loading, setLoading] = useState(initialBlocks.length === 0);
  const latestKey = useRef(initialBlocks[0]?.height ?? 0);
  const loadedOnce = useRef(initialBlocks.length > 0);

  useEffect(() => {
    const fetchBlocks = async () => {
      try {
        const apiUrl = usePostgresApiClient()
          ? `${getApiUrl()}/api/blocks?limit=5`
          : '/api/blocks?limit=5';

        const response = await fetch(apiUrl);
        const data = await response.json();
        if (data.blocks?.length) {
          const newTopHeight = data.blocks[0]?.height ?? data.blocks[0]?.block_height;
          if (newTopHeight !== latestKey.current) {
            latestKey.current = newTopHeight;
            setBlocks(data.blocks);
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

    const interval = setInterval(fetchBlocks, 10000);
    return () => clearInterval(interval);
  }, [initialBlocks.length]);

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="card card-compact animate-pulse">
            <div className="flex justify-between items-center">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="h-5 w-24 skeleton-bg rounded" />
                  <div className="h-4 w-10 skeleton-bg rounded" />
                </div>
                <div className="h-3 w-36 skeleton-bg rounded" />
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

  return (
    <div className="space-y-3">
      {blocks.map((block, index) => (
        <Link href={`/block/${block.height}`} key={block.height}>
          <div
            className="card card-compact card-interactive group"
          >
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
              <div className="flex-1">
                <div className="flex items-center space-x-3 mb-2">
                  <span className="w-6 h-6 flex items-center justify-center rounded-md bg-cipher-cyan/10">
                    <svg className="w-4 h-4 text-cipher-cyan" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                    </svg>
                  </span>
                  <h3 className="text-base sm:text-lg font-bold font-mono text-cipher-cyan group-hover:text-cipher-green transition-colors">
                    #{block.height}
                  </h3>
                  <Badge color="cyan">
                    {block.transactions} TX
                  </Badge>
                  {block.finality && (
                    <Badge color={block.finality === 'Finalized' ? 'green' : 'orange'}>
                      {block.finality === 'Finalized' ? 'Final' : 'Pending'}
                    </Badge>
                  )}
                </div>
                <div className="text-xs text-muted font-mono">
                  <span className="opacity-50">Hash: </span>
                  <code className="break-all">{block.hash.slice(0, 8)}...{block.hash.slice(-8)}</code>
                </div>
              </div>
              <div className="text-left sm:text-right sm:ml-6">
                <div className="text-sm text-secondary font-mono">
                  {formatRelativeTime(block.timestamp)}
                </div>
                <div className="text-xs text-muted mt-1" suppressHydrationWarning>
                  {new Date(block.timestamp * 1000).toLocaleString('en-US', {
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
});
