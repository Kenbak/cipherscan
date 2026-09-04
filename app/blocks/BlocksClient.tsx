'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { PageHeader, MetricCard, DataTable, HashLink, type DataTableColumn } from '@/components/ui';
import { formatRelativeTime, formatBlockInterval } from '@/lib/utils';
import { zatToZec } from '@/lib/format-numbers';
import { getApiUrl } from '@/lib/api-config';
import { Pagination } from '@/components/Pagination';
import { getCoinbaseClientInfo } from '@/lib/coinbase-client';
import { usePaginatedList, type BasePaginationState } from '@/hooks/usePaginatedList';
import { CURRENCY } from '@/lib/config';

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
  total_fees?: number | string | null;
}

const PAGE_SIZE = 25;

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
          <Link href={`/block/${block.height}`} className="font-mono text-sm text-primary hover:text-primary transition-colors">
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
        // Same lead/tail convention as every other hash display (e.g. the
        // block detail page's CopyableHash) — a block hash's leading zeros
        // (from proof-of-work) aren't distinguishing, but keeping the same
        // truncation shape everywhere matters more than trying to skip past
        // them here. The old plain CSS `truncate` on a fixed-width column
        // just clipped wherever the pixel width ran out, so it kept a
        // different number of characters depending on font/zoom instead of a
        // consistent, predictable lead+tail.
        <HashLink value={block.hash} href={`/block/${block.height}`} lead={10} tail={8} copy={false} linkClassName="font-mono text-xs text-muted hover:text-secondary transition-colors" />
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
              <span className="text-xs font-mono text-primary">{block.miner_pool}</span>
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
      id: 'fees',
      header: 'Fees',
      align: 'right',
      className: 'hidden lg:table-cell',
      skeletonWidth: 'w-14',
      cell: (block) => {
        if (block.total_fees == null) return <span className="font-mono text-xs text-muted/40">—</span>;
        const feeZec = zatToZec(block.total_fees);
        return (
          <span className="font-mono text-xs text-muted tabular-nums">
            {feeZec < 0.001 ? feeZec.toFixed(5) : feeZec.toFixed(4)} {CURRENCY}
          </span>
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
        // formatRelativeTime() reads Date.now(), which necessarily differs
        // between the server render and the client's hydration pass by
        // however long that round-trip took — usually not enough to change
        // the rounded text, but enough to flip it right at a unit boundary
        // (e.g. "59 seconds ago" -> "1 minute ago"). The mismatch is
        // expected and harmless (React docs list this exact case), so it's
        // suppressed here rather than fixed by forcing a client-only render.
        <span className="text-xs text-muted whitespace-nowrap" suppressHydrationWarning>
          {formatRelativeTime(block.timestamp)}
        </span>
      ),
    },
  ];
}

interface BlocksClientProps {
  initialBlocks?: Block[];
  initialTrailingBlock?: Block | null;
  initialPagination?: Partial<BasePaginationState> | null;
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
  const {
    items: blocks,
    page,
    pagination,
    loading,
    dataAvailable,
    extra: trailingBlock,
    firstHref,
    prevHref,
    nextHref,
  } = usePaginatedList<Block, BasePaginationState, Block | null>({
    endpoint: '/api/blocks/list',
    pageSize: PAGE_SIZE,
    archiveBasePath: '/blocks',
    getItemsFromResponse: (json) => (json.blocks as Block[]) || [],
    getLatestKey: (block) => Number(block.height),
    buildCursors: (visibleItems) => ({
      nextCursor: visibleItems.length > 0
        ? Number(visibleItems[visibleItems.length - 1].height)
        : null,
      prevCursor: visibleItems.length > 0 ? Number(visibleItems[0].height) : null,
    }),
    processExtra: (all, _visible, direction) => {
      if (direction === 'prev') return null;
      return all.length > PAGE_SIZE ? all[PAGE_SIZE] : null;
    },
    shouldWsRefresh: (msg, latestKey) => {
      const data = msg.data as { height?: number } | undefined;
      const height = data?.height ?? 0;
      return (
        (msg.type === 'new_block' && height > Number(latestKey)) ||
        (msg.type === 'chain_tip' && height > Number(latestKey))
      );
    },
    buildArchiveHref: (cursor, _secondary, direction, targetPage) => {
      if (targetPage <= 1 || cursor === null) return '/blocks';
      const params = new URLSearchParams({
        cursor: String(cursor),
        direction,
        page: String(targetPage),
      });
      return `/blocks?${params.toString()}`;
    },
    initialItems: initialBlocks,
    initialPagination,
    initialPage,
    initialCursor,
    initialDirection,
    initialUnavailable,
    initialExtra: initialTrailingBlock,
  });

  const [summary, setSummary] = useState<{ height: number | null; blocks24h: number | null; avgBlockTime: number | null; avgBlockFee: number | null; txsPerBlock: number | null }>({ height: null, blocks24h: null, avgBlockTime: null, avgBlockFee: null, txsPerBlock: null });
  const [zecPriceUsd, setZecPriceUsd] = useState<number | null>(null);

  useEffect(() => {
    const base = getApiUrl();
    fetch(`${base}/api/network/stats`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (!data) return;
        const blocks24h = data.mining?.blocks24h ?? null;
        // Excludes each block's mandatory coinbase tx — nobody "sent" it, so
        // counting it here would inflate "per block" activity with a
        // transaction every single block has by construction.
        const tx24hExclCoinbase = data.blockchain?.tx24hExclCoinbase ?? null;
        setSummary({
          height: data.network?.height ?? data.blockchain?.height ?? null,
          blocks24h,
          avgBlockTime: data.mining?.avgBlockTime ?? null,
          avgBlockFee: data.mining?.avgBlockFee ?? null,
          txsPerBlock: blocks24h && tx24hExclCoinbase ? Math.round((tx24hExclCoinbase / blocks24h) * 10) / 10 : null,
        });
      })
      .catch(() => {});
    fetch(`${base}/api/price`)
      .then(res => res.ok ? res.json() : null)
      .then(data => setZecPriceUsd(data?.price ?? null))
      .catch(() => {});
  }, []);

  // /api/network/stats is cached up to 2 minutes server-side, while the
  // block list itself refreshes live over the websocket (~15s cache) — right
  // after a new block, the list already shows it but this fetch hasn't
  // caught up yet, so the "Block Height" card would read one block behind
  // the table underneath it. Only the list's own live head is trustworthy
  // for "is there a newer block than what summary last saw", so take
  // whichever is higher; on page 2+ blocks[0] is a historical block, not the
  // tip, so summary.height (the actual network tip) is used untouched.
  const liveHeight = page === 1 && blocks[0]?.height
    ? Math.max(summary.height ?? 0, blocks[0].height) || null
    : summary.height;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-12 animate-fade-in">
      <PageHeader
        eyebrow="ALL_BLOCKS"
        title={page > 1 ? `Zcash Blocks - Page ${page}` : 'Latest Zcash Blocks'}
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

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        <MetricCard size="compact"
          label="Block Height"
          value={liveHeight != null ? liveHeight.toLocaleString() : '—'}
        />
        <MetricCard size="compact"
          label="Blocks (24h)"
          value={summary.blocks24h != null ? summary.blocks24h.toLocaleString() : '—'}
          hint="~1,152/day is normal"
        />
        <MetricCard size="compact"
          label="Avg Block Time"
          value={summary.avgBlockTime != null ? `${summary.avgBlockTime}s` : '—'}
          hint="Last 1,000 blocks · target 75s"
        />
        <MetricCard size="compact"
          label="Avg Block Fee (24h)"
          value={summary.avgBlockFee != null ? `${summary.avgBlockFee.toFixed(8)} ${CURRENCY}` : '—'}
          hint={summary.avgBlockFee != null && zecPriceUsd != null ? `≈ $${(summary.avgBlockFee * zecPriceUsd).toFixed(2)}` : undefined}
        />
        <MetricCard size="compact"
          label="Txs Per Block"
          value={summary.txsPerBlock != null ? summary.txsPerBlock.toLocaleString() : '—'}
          hint="Coinbase not counted"
        />
      </div>

      <DataTable
        columns={blockColumns(blocks, trailingBlock ?? null)}
        rows={blocks}
        rowKey={(block) => block.height}
        loading={loading}
      />

      <Pagination
        page={page}
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
