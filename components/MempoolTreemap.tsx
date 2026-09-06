'use client';

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { squarify, type TreemapCell } from '@/lib/treemap';
import { formatRelativeTime } from '@/lib/utils';

export interface MempoolTreemapHandle {
  toggleFullscreen: () => void;
}

export interface MempoolTreemapTx {
  txid: string;
  size: number;
  type: 'transparent' | 'shielded' | 'mixed';
  time: number;
}

const TYPE_LABEL: Record<MempoolTreemapTx['type'], string> = {
  transparent: 'Transparent',
  mixed: 'Mixed',
  shielded: 'Shielded',
};

/** Cells below this stay drawn at their true area but are not interactive. */
const MIN_INTERACTIVE_PX = 6;

/**
 * Gutter between tiles. Taken off the drawn rect rather than the layout, so
 * positions stay exact and neighbouring cells of the same colour still read
 * as separate transactions.
 */
const CELL_GAP = 2;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(bytes < 1024 * 10 ? 2 : 1)} KB`;
}

/**
 * The pending backlog as a treemap: one cell per transaction, area
 * proportional to its **byte size**, colour by privacy type.
 *
 * Size, never value. Shielded amounts are unknowable, so nothing here may
 * imply one — the legend names bytes as the denominator and the tooltip
 * shows no amount. The point of encoding bytes is that shielded
 * transactions are physically much larger than transparent ones, so the
 * shielded share of the mempool's *weight* differs from its share of the
 * transaction count, which a percentage alone cannot show.
 */
export const MempoolTreemap = forwardRef<MempoolTreemapHandle, {
  transactions: MempoolTreemapTx[];
  className?: string;
  /** Screensaver mode: dark canvas, no card chrome. */
  ambient?: boolean;
}>(function MempoolTreemap({ transactions, className = '', ambient = false }, ref) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Fullscreen targets the whole component, not just the plot, so the legend
  // naming the denominator stays on screen.
  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }, []);

  useImperativeHandle(ref, () => ({ toggleFullscreen }), [toggleFullscreen]);

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [hovered, setHovered] = useState<{ cell: TreemapCell<MempoolTreemapTx>; x: number; y: number } | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setBox({ w: Math.round(width), h: Math.round(height) });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const cells = useMemo(
    () =>
      squarify(
        transactions.map((tx) => ({ value: tx.size, datum: tx })),
        box.w,
        box.h,
      ),
    [transactions, box.w, box.h],
  );

  // Share of pending *bytes*, which is the denominator the legend names.
  const byteShare = useMemo(() => {
    const totals = { transparent: 0, mixed: 0, shielded: 0 };
    let total = 0;
    for (const tx of transactions) {
      if (!Number.isFinite(tx.size) || tx.size <= 0) continue;
      totals[tx.type] += tx.size;
      total += tx.size;
    }
    return { totals, total };
  }, [transactions]);

  const pct = (n: number) => (byteShare.total > 0 ? (n / byteShare.total) * 100 : 0);

  const immersive = ambient || isFullscreen;

  return (
    <div
      ref={containerRef}
      data-immersive={immersive}
      className={`mempool-visualization flex flex-col ${immersive ? 'bg-cipher-bg-dark p-4 sm:p-6' : ''} ${className}`}
    >
      <div ref={wrapRef} className="treemap-surface relative w-full flex-1 min-h-0">
        {box.w > 0 && box.h > 0 && cells.length > 0 && (
          <svg
            width={box.w}
            height={box.h}
            role="img"
            aria-label={`Pending transactions by byte size: ${pct(byteShare.totals.shielded).toFixed(0)}% shielded, ${pct(byteShare.totals.mixed).toFixed(0)}% mixed, ${pct(byteShare.totals.transparent).toFixed(0)}% transparent. The pending transactions table below lists the same data.`}
          >
            {cells.map((cell) => {
              const interactive = cell.w >= MIN_INTERACTIVE_PX && cell.h >= MIN_INTERACTIVE_PX;
              return (
                <rect
                  key={cell.datum.txid}
                  className="treemap-cell"
                  data-type={cell.datum.type}
                  x={cell.x}
                  y={cell.y}
                  width={Math.max(cell.w - CELL_GAP, 0.5)}
                  height={Math.max(cell.h - CELL_GAP, 0.5)}
                  style={interactive ? { cursor: 'pointer' } : undefined}
                  onMouseEnter={
                    interactive
                      ? () => setHovered({ cell, x: cell.x + cell.w / 2, y: cell.y })
                      : undefined
                  }
                  onMouseLeave={interactive ? () => setHovered(null) : undefined}
                  onClick={interactive ? () => router.push(`/tx/${cell.datum.txid}`) : undefined}
                />
              );
            })}
          </svg>
        )}

        {/* Keyed off the data, not the measured box: an empty mempool should
            say so even before the ResizeObserver has reported a size. */}
        {transactions.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-caption font-mono text-muted">
            No pending transactions
          </div>
        )}

        {hovered && (
          <div
            className="treemap-tooltip"
            style={{
              left: Math.min(Math.max(hovered.x, 90), Math.max(box.w - 90, 90)),
              top: hovered.y,
            }}
          >
            <div className="font-mono text-caption text-primary">
              {hovered.cell.datum.txid.slice(0, 10)}…{hovered.cell.datum.txid.slice(-6)}
            </div>
            <div className="font-mono text-caption text-secondary mt-1">
              {TYPE_LABEL[hovered.cell.datum.type]} · {formatBytes(hovered.cell.datum.size)}
            </div>
            <div className="font-mono text-caption text-muted">
              {formatRelativeTime(hovered.cell.datum.time)}
            </div>
          </div>
        )}
      </div>

      {/* Names the denominator explicitly: area is bytes, not value. */}
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-caption font-mono text-muted">
        <span>Area = share of shown bytes</span>
        {(['transparent', 'mixed', 'shielded'] as const).map((type) => (
          <span key={type} className="inline-flex items-center gap-1.5">
            <span className="tx-category-swatch" data-type={type} aria-hidden="true" />
            {TYPE_LABEL[type]} {pct(byteShare.totals[type]).toFixed(0)}%
          </span>
        ))}
      </div>
    </div>
  );
});
