'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getApiUrl } from '@/lib/api-config';
import { formatRelativeTime } from '@/lib/format-numbers';

interface RecentBlock {
  height: number;
  hash: string;
  timestamp: number;
  txCount: number;
  size: number;
  minerReward: number;
  fees: number;
}

export function RecentBlocksTable() {
  const [blocks, setBlocks] = useState<RecentBlock[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${getApiUrl()}/api/network/blocks/recent?limit=15`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.blocks) setBlocks(data.blocks);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="card p-6 animate-pulse">
        <div className="h-4 w-40 bg-cipher-border rounded mb-4" />
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-8 bg-cipher-border/50 rounded" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      <div
        className="px-4 sm:px-6 py-4 border-b flex items-center justify-between"
        style={{ borderColor: 'var(--color-border-subtle)' }}
      >
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted font-mono uppercase tracking-widest opacity-50">{'>'}</span>
          <h2 className="text-sm font-bold font-mono text-secondary uppercase tracking-wider">RECENT_BLOCKS</h2>
        </div>
        <Link href="/blocks" className="text-xs font-mono text-cipher-cyan hover:underline">
          View all →
        </Link>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr
              className="text-[10px] font-mono text-muted uppercase border-b"
              style={{ borderColor: 'var(--color-border-subtle)' }}
            >
              <th className="text-left px-4 py-3">Block</th>
              <th className="text-right px-4 py-3">Miner reward</th>
              <th className="text-right px-4 py-3">Txs</th>
              <th className="text-right px-4 py-3">Size</th>
              <th className="text-right px-4 py-3">Time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border-subtle)]">
            {blocks.map((b) => (
              <tr key={b.height} className="hover:bg-cipher-bg/30 transition-colors">
                <td className="px-4 py-2.5">
                  <Link href={`/block/${b.height}`} className="font-mono text-cipher-cyan hover:underline">
                    {b.height.toLocaleString()}
                  </Link>
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-primary whitespace-nowrap">
                  {b.minerReward.toFixed(4)} ZEC
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-secondary">{b.txCount}</td>
                <td className="px-4 py-2.5 text-right font-mono text-muted whitespace-nowrap">
                  {(b.size / 1024).toFixed(1)} KB
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-muted whitespace-nowrap">
                  {formatRelativeTime(b.timestamp)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
