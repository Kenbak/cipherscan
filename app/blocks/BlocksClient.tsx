'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
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
      {/* Header */}
      <div className="mb-6">
        <p className="text-xs text-muted font-mono uppercase tracking-widest mb-3">
          <span className="opacity-50">{'>'}</span> ALL_BLOCKS
        </p>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl sm:text-3xl font-bold text-primary">
            {pagination.page > 1 ? `Zcash Blocks - Page ${pagination.page}` : 'Latest Zcash Blocks'}
          </h1>
          <span className="text-xs font-mono text-muted">
            {!dataAvailable && blocks.length === 0
              ? 'Block data temporarily unavailable'
              : blocks.length > 0
              ? `Block #${blocks[0].height.toLocaleString()} to #${blocks[blocks.length - 1].height.toLocaleString()} · ${pagination.total.toLocaleString()} blocks`
              : `${pagination.total.toLocaleString()} blocks`}
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted border-b border-cipher-border">Height</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted border-b border-cipher-border hidden sm:table-cell">Hash</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted border-b border-cipher-border hidden lg:table-cell">Miner</th>
                <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-muted border-b border-cipher-border">Txs</th>
                <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-muted border-b border-cipher-border hidden md:table-cell">Size</th>
                <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-muted border-b border-cipher-border hidden lg:table-cell">Interval</th>
                <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-muted border-b border-cipher-border">Age</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 15 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-4 py-3.5 border-b border-cipher-border"><div className="h-4 w-24 bg-cipher-border rounded" /></td>
                    <td className="px-4 py-3.5 border-b border-cipher-border hidden sm:table-cell"><div className="h-4 w-40 bg-cipher-border rounded" /></td>
                    <td className="px-4 py-3.5 border-b border-cipher-border hidden lg:table-cell"><div className="h-4 w-16 bg-cipher-border rounded" /></td>
                    <td className="px-4 py-3.5 border-b border-cipher-border"><div className="h-4 w-8 bg-cipher-border rounded ml-auto" /></td>
                    <td className="px-4 py-3.5 border-b border-cipher-border hidden md:table-cell"><div className="h-4 w-16 bg-cipher-border rounded ml-auto" /></td>
                    <td className="px-4 py-3.5 border-b border-cipher-border hidden lg:table-cell"><div className="h-4 w-12 bg-cipher-border rounded ml-auto" /></td>
                    <td className="px-4 py-3.5 border-b border-cipher-border"><div className="h-4 w-16 bg-cipher-border rounded ml-auto" /></td>
                  </tr>
                ))
              ) : (() => {
                const maxSize = Math.max(1, ...blocks.map(b => b.size || 0));
                const intervalColors = {
                  'fast':      'text-cipher-cyan',
                  'normal':    'text-cipher-green',
                  'slow':      'text-amber-400',
                  'very-slow': 'text-red-400',
                };
                const barColors = {
                  'fast':      'bg-cipher-cyan/50',
                  'normal':    'bg-cipher-green/50',
                  'slow':      'bg-amber-400/50',
                  'very-slow': 'bg-red-400/50',
                };
                return blocks.map((block, idx) => {
                  const sizePct = Math.max(4, Math.min(100, ((block.size || 0) / maxSize) * 100));
                  const isFinalized = block.finality_status === 'Finalized';
                  const nextBlock = blocks[idx + 1] ?? (idx === blocks.length - 1 ? trailingBlock : null);
                  const gap = nextBlock ? block.timestamp - nextBlock.timestamp : null;
                  const interval = gap !== null && gap >= 0 ? formatBlockInterval(gap) : null;
                  const barPct = gap !== null ? Math.min(100, (gap / 300) * 100) : 0;
                  return (
                    <tr
                      key={block.height}
                      className="group transition-colors duration-100 hover:bg-[var(--color-hover)]"
                    >
                      <td className="px-4 h-[44px] border-b border-cipher-border">
                        <div className="flex items-center gap-2">
                          <Link href={`/block/${block.height}`} className="font-mono text-sm text-primary hover:text-cipher-cyan transition-colors">
                            {block.height.toLocaleString()}
                          </Link>
                          {isFinalized && (
                            <span
                              className="inline-block w-1.5 h-1.5 rounded-full bg-cipher-green/70"
                              title="Finalized"
                            />
                          )}
                        </div>
                      </td>
                      <td className="px-4 h-[44px] border-b border-cipher-border hidden sm:table-cell">
                        <Link href={`/block/${block.height}`} className="font-mono text-xs text-muted hover:text-secondary transition-colors truncate block max-w-[200px] lg:max-w-[300px]" title={`Canonical block ${block.height.toLocaleString()}`}>
                          {block.hash}
                        </Link>
                      </td>
                      <td className="px-4 h-[44px] border-b border-cipher-border hidden lg:table-cell">
                        {(() => {
                          const clientInfo = getCoinbaseClientInfo(block.coinbase_hex);
                          const tooltip = clientInfo.name
                            ? `${clientInfo.name}${clientInfo.version ? ' ' + clientInfo.version : ''}`
                            : undefined;
                          return (
                            <div className="flex items-center gap-1.5">
                              {clientInfo.emoji && (
                                <span className="text-sm leading-none" title={tooltip}>
                                  {clientInfo.emoji}
                                </span>
                              )}
                              {block.miner_pool ? (
                                <span className="text-xs font-mono text-cipher-cyan">{block.miner_pool}</span>
                              ) : (
                                <span className="text-xs font-mono text-muted/40">—</span>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-4 h-[44px] border-b border-cipher-border text-right">
                        <span className="font-mono text-sm text-primary">{block.transaction_count}</span>
                      </td>
                      <td className="px-4 h-[44px] border-b border-cipher-border text-right hidden md:table-cell">
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
                      </td>
                      <td className="px-4 h-[44px] border-b border-cipher-border text-right hidden lg:table-cell">
                        {interval ? (
                          <div className="flex items-center justify-end gap-2" title={`${gap}s between block ${nextBlock.height.toLocaleString()} and ${block.height.toLocaleString()}`}>
                            <div className="w-12 h-1 rounded-full bg-cipher-border-alpha/40 overflow-hidden">
                              <div
                                className={`h-full rounded-full ${barColors[interval.level]} transition-colors`}
                                style={{ width: `${barPct}%` }}
                              />
                            </div>
                            <span className={`font-mono text-xs ${intervalColors[interval.level]} w-14 text-right`}>
                              {interval.label}
                            </span>
                          </div>
                        ) : (
                          <span className="font-mono text-xs text-muted/40">--</span>
                        )}
                      </td>
                      <td className="px-4 h-[44px] border-b border-cipher-border text-right">
                        <span className="text-xs text-muted whitespace-nowrap">{formatRelativeTime(block.timestamp)}</span>
                      </td>
                    </tr>
                  );
                });
              })()}
            </tbody>
          </table>
        </div>
      </div>

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
