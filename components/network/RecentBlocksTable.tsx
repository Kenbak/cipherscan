'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getApiUrl } from '@/lib/api-config';
import { formatRelativeTime } from '@/lib/format-numbers';
import { DataTable, EmptyState, SectionHeader, type DataTableColumn } from '@/components/ui';

interface RecentBlock {
  height: number;
  hash: string;
  timestamp: number;
  txCount: number;
  size: number;
  minerReward: number;
  fees: number;
}

const columns: DataTableColumn<RecentBlock>[] = [
  {
    id: 'block',
    header: 'Block',
    skeletonWidth: 'w-24',
    cell: (b) => (
      <Link href={`/block/${b.height}`} className="font-mono text-sm text-cipher-cyan hover:underline">
        {b.height.toLocaleString()}
      </Link>
    ),
  },
  {
    id: 'reward',
    header: 'Miner reward',
    align: 'right',
    skeletonWidth: 'w-20',
    cell: (b) => (
      <span className="font-mono text-sm text-primary whitespace-nowrap">{b.minerReward.toFixed(4)} ZEC</span>
    ),
  },
  {
    id: 'txs',
    header: 'Txs',
    align: 'right',
    skeletonWidth: 'w-8',
    cell: (b) => <span className="font-mono text-sm text-secondary">{b.txCount}</span>,
  },
  {
    id: 'size',
    header: 'Size',
    align: 'right',
    skeletonWidth: 'w-14',
    cell: (b) => (
      <span className="font-mono text-sm text-muted whitespace-nowrap">{(b.size / 1024).toFixed(1)} KB</span>
    ),
  },
  {
    id: 'time',
    header: 'Time',
    align: 'right',
    skeletonWidth: 'w-16',
    cell: (b) => (
      <span className="font-mono text-sm text-muted whitespace-nowrap">{formatRelativeTime(b.timestamp)}</span>
    ),
  },
];

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

  return (
    <div>
      <SectionHeader
        label="RECENT_BLOCKS"
        actions={
          <Link href="/blocks" className="text-xs font-mono text-cipher-cyan hover:underline">
            View all →
          </Link>
        }
      />
      <DataTable
        columns={columns}
        rows={blocks}
        rowKey={(b) => b.height}
        loading={loading}
        skeletonRows={15}
        size="comfortable"
        empty={<EmptyState title="No recent blocks" />}
      />
    </div>
  );
}
