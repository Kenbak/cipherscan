'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { formatRelativeTime, formatBlockInterval } from '@/lib/utils';
import { usePostgresApiClient, getApiUrl } from '@/lib/api-config';
import { Pagination } from '@/components/Pagination';

interface Block {
  height: number;
  hash: string;
  timestamp: number;
  transaction_count: number;
  size: number;
  difficulty: number;
  finality_status?: string | null;
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

export default function BlocksPage() {
  const PAGE_SIZE = 25;
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [trailingBlock, setTrailingBlock] = useState<Block | null>(null);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState<PaginationState>({
    page: 1, totalPages: 0, total: 0, hasNext: false, hasPrev: false, nextCursor: null, prevCursor: null,
  });

  const fetchBlocks = useCallback(async (cursor?: number | null, direction?: string) => {
    setLoading(true);
    try {
      const base = usePostgresApiClient() ? getApiUrl() : '';
      const params = new URLSearchParams({ limit: String(PAGE_SIZE + 1) });
      if (cursor !== undefined && cursor !== null) {
        params.set('cursor', String(cursor));
        params.set('direction', direction || 'next');
      }
      const res = await fetch(`${base}/api/blocks/list?${params}`);
      const json = await res.json();
      if (json.success) {
        const all: Block[] = json.blocks;
        if (all.length > PAGE_SIZE) {
          setTrailingBlock(all[PAGE_SIZE]);
          setBlocks(all.slice(0, PAGE_SIZE));
        } else {
          setTrailingBlock(null);
          setBlocks(all);
        }
        setPagination(json.pagination);
      }
    } catch (err) {
      console.error('Error fetching blocks:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchBlocks(); }, [fetchBlocks]);

  const goFirst = () => fetchBlocks(null, undefined);
  const goPrev = () => fetchBlocks(pagination.prevCursor, 'prev');
  const goNext = () => fetchBlocks(pagination.nextCursor, 'next');

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-12 animate-fade-in">
      {/* Header */}
      <div className="mb-6">
        <p className="text-xs text-muted font-mono uppercase tracking-widest mb-3">
          <span className="opacity-50">{'>'}</span> ALL_BLOCKS
        </p>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl sm:text-3xl font-bold text-primary">Latest Zcash Blocks</h1>
          <span className="text-xs font-mono text-muted">
            {blocks.length > 0
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
                        <Link href={`/block/${block.height}`} className="font-mono text-xs text-muted hover:text-secondary transition-colors truncate block max-w-[200px] lg:max-w-[300px]">
                          {block.hash}
                        </Link>
                      </td>
                      <td className="px-4 h-[44px] border-b border-cipher-border text-right">
                        <span className="font-mono text-sm text-primary">{block.transaction_count}</span>
                      </td>
                      <td className="px-4 h-[44px] border-b border-cipher-border text-right hidden md:table-cell">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-16 lg:w-24 h-1 rounded-full bg-cipher-border/40 overflow-hidden">
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
                            <div className="w-12 h-1 rounded-full bg-cipher-border/40 overflow-hidden">
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
        onFirst={goFirst}
        onPrev={goPrev}
        onNext={goNext}
        loading={loading}
      />
    </div>
  );
}
