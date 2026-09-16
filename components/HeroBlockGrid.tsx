'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import { useWebSocket, type WebSocketMessage } from '@/hooks/useWebSocket';

const CELL_COUNT = 32;
// Keep the gold accent inside the fully visible center of the edge mask.
const ACCENT_CELLS = [10, 11, 12, 13, 18, 19, 20, 21];

/** A quiet visual response to new blocks received on the shared event feed. */
export function HeroBlockGrid({ initialBlock }: { initialBlock?: { hash: string; height: number } }) {
  const tooltipId = useId();
  const [showTooltip, setShowTooltip] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const visibleRef = useRef(false);
  const seenHashes = useRef(new Set(initialBlock ? [initialBlock.hash.toLowerCase()] : []));
  const [accent, setAccent] = useState({ hash: '', cell: 11, animate: false, block: initialBlock ?? null });

  useWebSocket({
    onMessage: (message: WebSocketMessage) => {
      if (message.type !== 'new_block' && message.type !== 'chain_tip') return;
      const hash = message.data?.hash;
      const rawHeight = message.data?.height;
      if (typeof rawHeight !== 'number' && (typeof rawHeight !== 'string' || !/^\d+$/.test(rawHeight))) return;
      const height = Number(rawHeight);
      if (typeof hash !== 'string' || !/^[a-f0-9]{64}$/i.test(hash) || !Number.isSafeInteger(height) || height < 0) return;
      const normalized = hash.toLowerCase();
      if (seenHashes.current.has(normalized)) return;
      seenHashes.current.add(normalized);
      if (seenHashes.current.size > 64) {
        const oldest = seenHashes.current.values().next().value;
        if (oldest) seenHashes.current.delete(oldest);
      }
      // Connection snapshots and events received while away are not new-block pulses.
      if (message.type !== 'new_block' || !visibleRef.current || document.hidden) {
        setAccent(previous => ({ ...previous, block: { hash: normalized, height }, animate: false }));
        return;
      }
      setAccent(previous => {
        let position = parseInt(normalized.slice(-6), 16) % ACCENT_CELLS.length;
        if (ACCENT_CELLS[position] === previous.cell) position = (position + 1) % ACCENT_CELLS.length;
        return { hash: normalized, cell: ACCENT_CELLS[position], animate: true, block: { hash: normalized, height } };
      });
    },
  });

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const desktop = window.matchMedia('(min-width: 1024px)');
    let inView = false;
    const sync = () => {
      visibleRef.current = inView && desktop.matches && !document.hidden;
      if (!visibleRef.current) {
        setAccent(previous => previous.animate ? { ...previous, animate: false } : previous);
        setShowTooltip(false);
      }
    };
    const observer = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      sync();
    });
    observer.observe(grid);
    desktop.addEventListener('change', sync);
    document.addEventListener('visibilitychange', sync);
    return () => {
      visibleRef.current = false;
      observer.disconnect();
      desktop.removeEventListener('change', sync);
      document.removeEventListener('visibilitychange', sync);
    };
  }, []);

  return (
    <div ref={gridRef} className="hero-block-grid"
      onMouseLeave={() => setShowTooltip(false)}
      onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setShowTooltip(false); }}
      onKeyDown={event => { if (event.key === 'Escape') setShowTooltip(false); }}>
      <div className="hero-block-cells" aria-hidden="true">
        {Array.from({ length: CELL_COUNT }, (_, index) => (
          <span
            key={accent.cell === index ? `${index}-${accent.hash}` : index}
            className="hero-block-cell"
            data-active={index === accent.cell ? '' : undefined}
            data-pulse={index === accent.cell && accent.animate ? '' : undefined}
          />
        ))}
      </div>
      {accent.block && <>
        <Link href={`/block/${accent.block.height}`} prefetch={false} className="hero-block-link"
          style={{ left: `calc(${accent.cell % 8} * (var(--hero-cell-size) + var(--hero-cell-gap)))`, top: `calc(${Math.floor(accent.cell / 8)} * (var(--hero-cell-size) + var(--hero-cell-gap)))` }}
          aria-label={`View block ${accent.block.height.toLocaleString('en-US')}`}
          aria-describedby={tooltipId}
          onMouseEnter={() => setShowTooltip(true)} onFocus={() => setShowTooltip(true)} />
        <div id={tooltipId} role="tooltip" hidden={!showTooltip} className="hero-block-tooltip"
          style={{ left: `calc(${accent.cell % 8} * (var(--hero-cell-size) + var(--hero-cell-gap)) + var(--hero-cell-size) / 2)`, top: `calc(${Math.floor(accent.cell / 8)} * (var(--hero-cell-size) + var(--hero-cell-gap)))` }}>
          <div className="hero-block-readout">
            <span className="text-primary"><span className="text-brand-gold">&gt;</span> block <span className="text-muted">#</span>{accent.block.height.toLocaleString('en-US')}</span>
            <span className="block text-muted">{accent.block.hash.slice(0, 8)}…{accent.block.hash.slice(-8)}</span>
          </div>
        </div>
      </>}
    </div>
  );
}
