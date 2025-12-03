'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { formatRelativeTime } from '@/lib/utils';
import { usePostgresApiClient, getApiUrl } from '@/lib/api-config';

interface Block {
  height: number;
  hash: string;
  timestamp: number;
  transactions: number;
  size: number;
}

interface RecentBlocksProps {
  initialBlocks?: Block[];
}

export function RecentBlocks({ initialBlocks = [] }: RecentBlocksProps) {
  const [blocks, setBlocks] = useState<Block[]>(initialBlocks);
  const [loading, setLoading] = useState(initialBlocks.length === 0);

  useEffect(() => {
    const fetchBlocks = async () => {
      try {
        // For testnet, call Express API directly; for mainnet, use Next.js API
        const apiUrl = usePostgresApiClient()
          ? `${getApiUrl()}/api/blocks?limit=5`
          : '/api/blocks?limit=5';

        const response = await fetch(apiUrl);
        const data = await response.json();
        if (data.blocks) {
          setBlocks(data.blocks);
        }
      } catch (error) {
        console.error('Error fetching blocks:', error);
      } finally {
        setLoading(false);
      }
    };

    // Only fetch if we don't have initial blocks
    if (initialBlocks.length === 0) {
      fetchBlocks();
    }

    // Set up polling for live updates
    const interval = setInterval(fetchBlocks, 10000); // Update every 10s
    return () => clearInterval(interval);
  }, [initialBlocks.length]);

  if (loading) {
    return (
      <div className="card">
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cipher-cyan"></div>
          <p className="text-gray-400 ml-4 font-mono text-lg">Syncing blockchain data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {blocks.map((block, index) => (
        <Link href={`/block/${block.height}`} key={block.height}>
          <div
            className="card hover:border-cipher-cyan transition-all cursor-pointer group animate-slide-up"
            style={{ animationDelay: `${index * 100}ms` }}
          >
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
              <div className="flex-1">
                <div className="flex items-center space-x-3 mb-3">
                  <span className="text-2xl">📦</span>
                  <h3 className="text-lg font-bold font-mono text-cipher-cyan group-hover:text-cipher-green transition-colors">
                    #{block.height.toLocaleString()}
                  </h3>
                  <span className="badge badge-info">
                    {block.transactions} TX
                  </span>
                </div>
                <div className="text-xs text-gray-500 font-mono mt-2">
                  <span className="opacity-50">Hash: </span>
                  <code className="break-all">{block.hash.slice(0, 8)}...{block.hash.slice(-8)}</code>
                </div>
              </div>
              <div className="text-left sm:text-right sm:ml-6">
                <div className="text-sm text-gray-400 font-mono">
                  {formatRelativeTime(block.timestamp)}
                </div>
                <div className="text-xs text-gray-500 mt-1 suppress-hydration-warning">
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
}
