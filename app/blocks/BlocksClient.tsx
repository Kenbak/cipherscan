'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { PageHeader, MetricCard, DataTable, type DataTableColumn } from '@/components/ui';
import { formatRelativeTime, formatBlockInterval } from '@/lib/utils';
import { usePostgresApiClient, getApiUrl } from '@/lib/api-config';
import { Pagination } from '@/components/Pagination';
import { getCoinbaseClientEmoji, getCoinbaseClientInfo } from '@/lib/coinbase-client';

interface Block {
  height: number;
  hash: string;
  timestamp: number;
  transaction_count: number;
  size: number;
  difficulty: number;
  finality_status?: string | null;
  miner_pool?: string | null;
  coinbase_hex?: string | null;
}

interface PaginationState {
  page: number;
  totalPages: number;
  total: number;
  hasNext: boolean;
  hasPrev: boolean;
  nextCursor: number | null;
  prevCursor: number | null;
}

const INTERVAL_TEXT_COLORS = {
  'fast':      'text-cipher-cyan',
  'normal':    'text-cipher-green',
  'slow':      'text-amber-400',
  'very-slow': 'text-danger',
} as const;

const INTERVAL_BAR_COLORS = {
  'fast':      'bg-cipher-cyan/50',
  'normal':    'bg-cipher-green/50',
  'slow':      'bg-amber-400/50',
  'very-slow': 'bg-red-400/50',
} as const;

/** Column defs close over the block list because interval computation needs
 *  each row's successor (and the trailing block beyond the page boundary). */
function blockColumns(blocks: Block[], trailingBlock: Block | null): DataTableColumn<Block>[] {
  const maxSize = Math.max(1, ...blocks.map(b => b.size || 0));
  return [
    {
      id: 'height',
      header: 'Height',
      skeletonWidth: 'w-24',
      cell: (block) => (
        <div className="flex items-center gap-2">
          <Link href={`/block/${block.height}`} className="font-mono text-sm text-primary hover:text-cipher-cyan transition-colors">
            {block.height.toLocaleString()}
          </Link>
          {block.finality_status === 'Finalized' && (
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-cipher-green/70" title="Finalized" />
          )}
        </div>
      ),
    },
    {
      id: 'hash',
      header: 'Hash',
      className: 'hidden sm:table-cell',
      skeletonWidth: 'w-40',
      cell: (block) => (
        <Link href={`/block/${block.height}`} className="font-mono text-xs text-muted hover:text-secondary transition-colors truncate block max-w-[200px] lg:max-w-[300px]" title={`Canonical block ${block.height.toLocaleString()}`}>
          {block.hash}
        </Link>
      ),
    },
    {
      id: 'miner',
      header: 'Miner',
      className: 'hidden lg:table-cell',
      skeletonWidth: 'w-16',
      cell: (block) => {
        const clientInfo = getCoinbaseClientInfo(block.coinbase_hex);
        const tooltip = clientInfo.name
          ? `${clientInfo.name}${clientInfo.version ? ' ' + clientInfo.version : ''}`
          : undefined;
        return (
          <div className="flex items-center gap-1.5">
            {clientInfo.emoji && (
              <span className="text-sm leading-none" title={tooltip}>{clientInfo.emoji}</span>
            )}
            {block.miner_pool ? (
              <span className="text-xs font-mono text-cipher-cyan">{block.miner_pool}</span>
            ) : (
              <span className="text-xs font-mono text-muted/40">—</span>
            )}
          </div>
        );
      },
    },
    {
      id: 'txs',
      header: 'Txs',
      align: 'right',
      skeletonWidth: 'w-8',
      cell: (block) => <span className="font-mono text-sm text-primary">{block.transaction_count}</span>,
    },
    {
      id: 'size',
      header: 'Size',
      align: 'right',
      className: 'hidden md:table-cell',
      skeletonWidth: 'w-16',
      cell: (block) => {
        const sizePct = Math.max(4, Math.min(100, ((block.size || 0) / maxSize) * 100));
        return (
          <div className="flex items-center justify-end gap-2">
            <div className="w-16 lg:w-24 h-1 rounded-full bg-cipher-border-alpha/40 overflow-hidden">
              <div
                className="h-full rounded-full bg-cipher-cyan/60 group-hover:bg-cipher-cyan transition-colors"
                style={{ width: `${sizePct}%` }}
              />
            </div>
            <span className="font-mono text-xs text-muted w-16 text-right">
              {(block.size / 1024).toFixed(1)} KB
            </span>
          </div>
        );
      },
    },
    {
      id: 'interval',
      header: 'Interval',
      align: 'right',
      className: 'hidden lg:table-cell',
      skeletonWidth: 'w-12',
      cell: (block, idx) => {
        const nextBlock = blocks[idx + 1] ?? (idx === blocks.length - 1 ? trailingBlock : null);
        const gap = nextBlock ? block.timestamp - nextBlock.timestamp : null;
        const interval = gap !== null && gap >= 0 ? formatBlockInterval(gap) : null;
        const barPct = gap !== null ? Math.min(100, (gap / 300) * 100) : 0;
        if (!interval || !nextBlock) {
          return <span className="font-mono text-xs text-muted/40">--</span>;
        }
        return (
          <div className="flex items-center justify-end gap-2" title={`${gap}s between block ${nextBlock.height.toLocaleString()} and ${block.height.toLocaleString()}`}>
            <div className="w-12 h-1 rounded-full bg-cipher-border-alpha/40 overflow-hidden">
              <div
                className={`h-full rounded-full ${INTERVAL_BAR_COLORS[interval.level]} transition-colors`}
                style={{ width: `${barPct}%` }}
              />
            </div>
            <span className={`font-mono text-xs ${INTERVAL_TEXT_COLORS[interval.level]} w-14 text-right`}>
              {interval.label}
            </span>
          </div>
        );
      },
    },
    {
      id: 'age',
      header: 'Age',
      align: 'right',
      skeletonWidth: 'w-16',
      cell: (block) => (
        <span className="text-xs text-muted whitespace-nowrap">{formatRelativeTime(block.timestamp)}</span>
      ),
    },
  ];
}

interface BlocksClientProps {
  initialBlocks?: Block[];
  initialTrailingBlock?: Block | null;
  initialPagination?: PaginationState | null;
  initialCursor?: number | null;
  initialDirection?: 'next' | 'prev';
  initialPage?: number;
  initialUnavailable?: boolean;
}

export default function BlocksClient({
  initialBlocks = [],
  initialTrailingBlock = null,
  initialPagination = null,
  initialCursor = null,
  initialDirection = 'next',
  initialPage = 1,
  initialUnavailable = false,
}: BlocksClientProps) {
  const PAGE_SIZE = 25;
  const hasInitialData = initialPagination !== null || initialBlocks.length > 0;
  const fallbackStarted = useRef(false);
  const [blocks, setBlocks] = useState<Block[]>(initialBlocks);
  const [trailingBlock, setTrailingBlock] = useState<Block | null>(initialTrailingBlock);
  const [loading, setLoading] = useState(!hasInitialData);
  const [dataAvailable, setDataAvailable] = useState(!initialUnavailable);
  const [pagination, setPagination] = useState<PaginationState>(initialPagination ?? {
    page: 1, totalPages: 0, total: 0, hasNext: false, hasPrev: false, nextCursor: null, prevCursor: null,
  });
  const [summary, setSummary] = useState<{ height: number | null; blocks24h: number | null; avgBlockTime: number | null; txsPerBlock: number | null }>({ height: null, blocks24h: null, avgBlockTime: null, txsPerBlock: null });

  const fetchBlocks = useCallback(async (
    cursor?: number | null,
    direction?: 'next' | 'prev',
    targetPage = 1,
  ) => {
    setLoading(true);
    try {
      const base = usePostgresApiClient() ? getApiUrl() : '';
      const params = new URLSearchParams({ limit: String(PAGE_SIZE + 1) });
      if (cursor !== undefined && cursor !== null) {
        params.set('cursor', String(cursor));
        params.set('direction', direction || 'next');
      }
      const res = await fetch(`${base}/api/blocks/list?${params}`);
      if (!res.ok) throw new Error(`Block list returned ${res.status}`);
      const json = await res.json();
      if (json.success) {
        const all: Block[] = json.blocks || [];
        const reverseOffset = direction === 'prev' && all.length > PAGE_SIZE ? 1 : 0;
        const visibleBlocks = all.slice(reverseOffset, reverseOffset + PAGE_SIZE);
        if (direction !== 'prev' && all.length > PAGE_SIZE) {
          setTrailingBlock(all[PAGE_SIZE]);
        } else {
          setTrailingBlock(null);
        }
        setBlocks(visibleBlocks);
        setPagination({
          ...json.pagination,
          page: targetPage,
          totalPages: Math.ceil((Number(json.pagination?.total) || 0) / PAGE_SIZE),
          hasNext: direction === 'prev'
            ? cursor !== null && cursor !== undefined && visibleBlocks.length > 0
            : all.length > PAGE_SIZE,
          hasPrev: targetPage > 1,
          nextCursor: visibleBlocks.length > 0
            ? Number(visibleBlocks[visibleBlocks.length - 1].height)
            : null,
          prevCursor: visibleBlocks.length > 0 ? Number(visibleBlocks[0].height) : null,
        });
        setDataAvailable(true);
      } else {
        setDataAvailable(false);
      }
    } catch (err) {
      console.error('Error fetching blocks:', err);
      setDataAvailable(false);
    } finally {
      setLoading(false);
    }
  }, []);

  // Server-rendered initial data already covers the first page; only fetch
  // on mount when the server couldn't provide it.
  useEffect(() => {
    if (hasInitialData || fallbackStarted.current) return;
    fallbackStarted.current = true;
    fetchBlocks(initialCursor, initialDirection, initialPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const base = usePostgresApiClient() ? getApiUrl() : '';
    fetch(`${base}/api/network/stats`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (!data) return;
        const blocks24h = data.mining?.blocks24h ?? null;
        const tx24h = data.blockchain?.tx24h ?? null;
        setSummary({
          height: data.network?.height ?? data.blockchain?.height ?? null,
          blocks24h,
          avgBlockTime: data.mining?.avgBlockTime ?? null,
          txsPerBlock: blocks24h && tx24h ? Math.round((tx24h / blocks24h) * 10) / 10 : null,
        });
      })
      .catch(() => {});
  }, []);

  const buildArchiveHref = (cursor: number | null, direction: 'next' | 'prev', page: number) => {
    if (page <= 1 || cursor === null) return '/blocks';
    const params = new URLSearchParams({
      cursor: String(cursor),
      direction,
      page: String(page),
    });
    return `/blocks?${params.toString()}`;
  };

  const firstHref = '/blocks';
  const prevHref = pagination.page <= 2
    ? firstHref
    : buildArchiveHref(pagination.prevCursor, 'prev', pagination.page - 1);
  const nextHref = buildArchiveHref(pagination.nextCursor, 'next', pagination.page + 1);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-12 animate-fade-in">
      <PageHeader
        eyebrow="ALL_BLOCKS"
        title={pagination.page > 1 ? `Zcash Blocks - Page ${pagination.page}` : 'Latest Zcash Blocks'}
        actions={
          <span className="text-xs font-mono text-muted">
            {!dataAvailable && blocks.length === 0
              ? 'Block data temporarily unavailable'
              : blocks.length > 0
              ? `Block #${blocks[0].height.toLocaleString()} to #${blocks[blocks.length - 1].height.toLocaleString()} · ${pagination.total.toLocaleString()} blocks`
              : `${pagination.total.toLocaleString()} blocks`}
          </span>
        }
      />

      {/* Summary Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <MetricCard
          label="Block Height"
          value={summary.height != null ? summary.height.toLocaleString() : '—'}
        />
        <MetricCard
          label="Blocks (24h)"
          value={summary.blocks24h != null ? summary.blocks24h.toLocaleString() : '—'}
          accent="cyan"
        />
        <MetricCard
          label="Avg Block Time"
          value={summary.avgBlockTime != null ? `${summary.avgBlockTime}s` : '—'}
          accent="green"
        />
        <MetricCard
          label="Txs Per Block"
          value={summary.txsPerBlock != null ? summary.txsPerBlock.toLocaleString() : '—'}
        />
      </div>

      {/* Table */}
      <DataTable
        columns={blockColumns(blocks, trailingBlock)}
        rows={blocks}
        rowKey={(block) => block.height}
        loading={loading}
      />

      {/* Pagination */}
      <Pagination
        page={pagination.page}
        totalPages={pagination.totalPages}
        hasNext={pagination.hasNext}
        hasPrev={pagination.hasPrev}
        firstHref={firstHref}
        prevHref={prevHref}
        nextHref={nextHref}
        loading={loading}
      />
    </div>
  );
}
