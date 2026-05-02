'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Card, CardBody } from '@/components/ui/Card';
import { getApiUrl } from '@/lib/api-config';

interface BlockRow {
  height: number;
  hash: string;
  timestamp: number;
  transaction_count: number;
  size: number;
  finality_status?: string | null;
}

const DEFAULT_BLOCKS = 60;

/**
 * Block Activity Chart
 *
 * A mempool.space-style visualization of recent blocks as vertical bars,
 * where each bar's HEIGHT scales with the block's byte size (log-scaled
 * so small coinbase-only blocks are still visible next to full blocks).
 *
 * Color-coded by finality state: green (finalized), cyan (pending), orange
 * (being voted on right now). Hover for details, click to open block detail.
 *
 * Works for any Zcash chain because it only needs /api/blocks — we just
 * recommend showing it for Crosslink where the classic geo node map is
 * less useful (small peer pool).
 */
export function BlockActivityChart({
  limit = DEFAULT_BLOCKS,
  title = 'Block Activity',
  subtitle = 'Bar height scales with block size. Click any bar to open the block.',
  refreshMs = 15_000,
}: {
  limit?: number;
  title?: string;
  subtitle?: string;
  refreshMs?: number;
}) {
  const [blocks, setBlocks] = useState<BlockRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [finalizedHeight, setFinalizedHeight] = useState<number | null>(null);
  const [votedHash, setVotedHash] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const api = getApiUrl();
      const [blocksRes, crossRes, bftRes] = await Promise.all([
        fetch(`${api}/api/blocks?limit=${limit}`),
        fetch(`${api}/api/crosslink`).catch(() => null),
        fetch(`${api}/api/crosslink/bft-tip`).catch(() => null),
      ]);

      if (blocksRes.ok) {
        const data = await blocksRes.json();
        setBlocks(data.blocks || []);
      }
      if (crossRes && crossRes.ok) {
        const j = await crossRes.json();
        if (j.success) setFinalizedHeight(j.finalizedHeight);
      }
      if (bftRes && bftRes.ok) {
        const j = await bftRes.json();
        if (j.success) setVotedHash(j.votedBlockHash || null);
      }
    } catch (err) {
      console.error('BlockActivityChart fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, refreshMs);
    return () => clearInterval(id);
  }, [fetchData, refreshMs]);

  // Chart data: oldest → newest so the timeline reads left-to-right
  const ordered = useMemo(() => [...blocks].reverse(), [blocks]);

  const maxSize = useMemo(
    () => ordered.reduce((m, b) => Math.max(m, b.size || 0), 1),
    [ordered]
  );
  const avgSize = useMemo(() => {
    if (ordered.length === 0) return 0;
    const total = ordered.reduce((s, b) => s + (b.size || 0), 0);
    return total / ordered.length;
  }, [ordered]);
  const totalTxs = useMemo(
    () => ordered.reduce((s, b) => s + (b.transaction_count || 0), 0),
    [ordered]
  );

  // Log-scaled bar height: small blocks stay visible (>= 8% of chart).
  const barHeight = (size: number): number => {
    if (maxSize <= 0) return 20;
    const logMax = Math.log10(Math.max(maxSize, 2048));
    const logS = Math.log10(Math.max(size, 1024));
    const pct = (logS / logMax) * 100;
    return Math.max(8, Math.min(100, pct));
  };

  const hoveredBlock = hovered ? ordered.find((b) => b.hash === hovered) : null;

  return (
    <Card>
      <CardBody className="p-4 sm:p-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs text-muted font-mono uppercase tracking-widest opacity-50">
                {'>'}
              </span>
              <h2 className="text-sm font-bold font-mono text-secondary uppercase tracking-wider">
                {title.toUpperCase().replace(/ /g, '_')}
              </h2>
            </div>
            <p className="text-xs text-muted">{subtitle}</p>
          </div>
          {!loading && ordered.length > 0 && (
            <div className="flex gap-4 text-[11px] font-mono text-muted">
              <Stat label="blocks" value={ordered.length.toString()} />
              <Stat label="avg size" value={fmtBytes(avgSize)} />
              <Stat label="max" value={fmtBytes(maxSize)} />
              <Stat label="total txs" value={totalTxs.toLocaleString()} />
            </div>
          )}
        </div>

        {/* Chart */}
        {loading && ordered.length === 0 ? (
          <div className="h-48 flex items-center justify-center">
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-cipher-cyan border-t-transparent" />
          </div>
        ) : ordered.length === 0 ? (
          <div className="h-48 flex items-center justify-center text-sm text-muted">
            No blocks yet.
          </div>
        ) : (
          <div className="relative">
            {/* Y axis scale ticks */}
            <div className="absolute inset-y-0 left-0 w-12 flex flex-col justify-between text-[9px] font-mono text-muted/60 pointer-events-none pr-2 text-right">
              <span>{fmtBytes(maxSize)}</span>
              <span>{fmtBytes(maxSize / 4)}</span>
              <span>0</span>
            </div>

            {/* Bars */}
            <div className="ml-12 flex items-end gap-[2px] sm:gap-[3px] h-44 overflow-x-auto no-scrollbar border-b border-cipher-border-alpha/50 pb-0.5">
              {ordered.map((b) => {
                const isFinalized =
                  finalizedHeight !== null ? b.height <= finalizedHeight : false;
                const isVoting = b.hash === votedHash;
                const h = barHeight(b.size || 0);
                return (
                  <BlockBar
                    key={b.hash}
                    block={b}
                    heightPct={h}
                    isFinalized={isFinalized}
                    isVoting={isVoting}
                    isHovered={hovered === b.hash}
                    onHoverChange={(hov) => setHovered(hov ? b.hash : null)}
                  />
                );
              })}
            </div>

            {/* X axis labels — first/middle/last block heights */}
            <div className="ml-12 flex justify-between text-[10px] font-mono text-muted mt-1 px-0.5">
              <span>#{ordered[0]?.height.toLocaleString()}</span>
              {ordered.length > 2 && (
                <span className="hidden sm:inline">
                  #{ordered[Math.floor(ordered.length / 2)]?.height.toLocaleString()}
                </span>
              )}
              <span>#{ordered[ordered.length - 1]?.height.toLocaleString()}</span>
            </div>

            {/* Hovered block info panel */}
            <div className="mt-4 h-16 flex items-center justify-center">
              {hoveredBlock ? (
                <Link
                  href={`/block/${hoveredBlock.height}`}
                  className="card px-4 py-2.5 flex items-center gap-4 hover:border-cipher-cyan transition-colors"
                >
                  <div>
                    <div className="text-[10px] text-muted font-mono uppercase tracking-wider">
                      Block
                    </div>
                    <div className="font-mono font-bold text-primary text-sm">
                      #{hoveredBlock.height.toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted font-mono uppercase tracking-wider">
                      Size
                    </div>
                    <div className="font-mono text-primary text-sm">
                      {fmtBytes(hoveredBlock.size || 0)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted font-mono uppercase tracking-wider">
                      Txs
                    </div>
                    <div className="font-mono text-primary text-sm">
                      {hoveredBlock.transaction_count}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted font-mono uppercase tracking-wider">
                      Age
                    </div>
                    <div className="font-mono text-secondary text-sm">
                      {fmtAge(hoveredBlock.timestamp)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted font-mono uppercase tracking-wider">
                      Status
                    </div>
                    <div
                      className={`font-mono text-sm ${
                        hoveredBlock.hash === votedHash
                          ? 'text-cipher-orange'
                          : finalizedHeight !== null && hoveredBlock.height <= finalizedHeight
                          ? 'text-cipher-green'
                          : 'text-cipher-cyan'
                      }`}
                    >
                      {hoveredBlock.hash === votedHash
                        ? 'voting'
                        : finalizedHeight !== null && hoveredBlock.height <= finalizedHeight
                        ? 'finalized'
                        : 'pending'}
                    </div>
                  </div>
                </Link>
              ) : (
                <p className="text-xs text-muted text-center">
                  Hover any bar to see details, click to open the block.
                </p>
              )}
            </div>

            {/* Legend */}
            <div className="mt-3 flex items-center justify-center gap-4 text-[10px] font-mono text-muted">
              <LegendSwatch color="bg-cipher-green/80" label="finalized" />
              <LegendSwatch color="bg-cipher-orange/80" label="voting now" />
              <LegendSwatch color="bg-cipher-cyan/70" label="pending" />
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function BlockBar({
  block,
  heightPct,
  isFinalized,
  isVoting,
  isHovered,
  onHoverChange,
}: {
  block: BlockRow;
  heightPct: number;
  isFinalized: boolean;
  isVoting: boolean;
  isHovered: boolean;
  onHoverChange: (hovered: boolean) => void;
}) {
  const color = isVoting
    ? 'bg-cipher-orange/80 hover:bg-cipher-orange border-cipher-orange'
    : isFinalized
    ? 'bg-cipher-green/70 hover:bg-cipher-green/90 border-cipher-green'
    : 'bg-cipher-cyan/60 hover:bg-cipher-cyan/80 border-cipher-cyan';

  return (
    <Link
      href={`/block/${block.height}`}
      className={`relative shrink-0 w-[6px] sm:w-[8px] rounded-t-sm border-t ${color} transition-all ${
        isHovered ? 'ring-2 ring-white/20 scale-110' : ''
      } ${isVoting ? 'animate-pulse' : ''}`}
      style={{ height: `${heightPct}%` }}
      onMouseEnter={() => onHoverChange(true)}
      onMouseLeave={() => onHoverChange(false)}
      aria-label={`Block ${block.height}, ${block.size} bytes`}
    />
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[9px] uppercase tracking-wider opacity-60">{label}</span>
      <span className="text-primary">{value}</span>
    </div>
  );
}

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`block w-3 h-3 rounded-sm ${color}`} />
      <span>{label}</span>
    </span>
  );
}

function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function fmtAge(epoch: number): string {
  const diff = Math.max(0, Math.floor(Date.now() / 1000 - epoch));
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}
