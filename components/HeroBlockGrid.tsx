'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import { useHomeBlocks } from '@/components/HomeBlocksProvider';

const CELL_COUNT = 32;
// Keep the gold accent inside the fully visible center of the edge mask.
const ACCENT_CELLS = [10, 11, 12, 13, 18, 19, 20, 21];

/** A quiet visual response to changes in the shared, indexed block snapshot. */
export function HeroBlockGrid() {
  const { blocks } = useHomeBlocks();
  const block = blocks[0];
  const latestHash = block?.hash;
  const tooltipId = useId();
  const [showTooltip, setShowTooltip] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const visibleRef = useRef(false);
  const lastHash = useRef(latestHash);
  const [accent, setAccent] = useState({ hash: '', cell: 11, animate: false });

  useEffect(() => {
    const previousHash = lastHash.current;
    lastHash.current = latestHash;
    // The tooltip reads the shared snapshot directly. Only animation is local state.
    if (!latestHash || !previousHash || latestHash === previousHash || !visibleRef.current || document.hidden) return;
    setAccent(previous => {
      let position = parseInt(latestHash.slice(-6), 16) % ACCENT_CELLS.length;
      if (ACCENT_CELLS[position] === previous.cell) position = (position + 1) % ACCENT_CELLS.length;
      return { hash: latestHash, cell: ACCENT_CELLS[position], animate: true };
    });
  }, [latestHash]);

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
      {block && <>
        <Link href={`/block/${block.height}`} prefetch={false} className="hero-block-link"
          style={{ left: `calc(${accent.cell % 8} * (var(--hero-cell-size) + var(--hero-cell-gap)))`, top: `calc(${Math.floor(accent.cell / 8)} * (var(--hero-cell-size) + var(--hero-cell-gap)))` }}
          aria-label={`View block ${block.height.toLocaleString('en-US')}`}
          aria-describedby={tooltipId}
          onMouseEnter={() => setShowTooltip(true)} onFocus={() => setShowTooltip(true)} />
        <div id={tooltipId} role="tooltip" hidden={!showTooltip} className="hero-block-tooltip"
          style={{ left: `calc(${accent.cell % 8} * (var(--hero-cell-size) + var(--hero-cell-gap)) + var(--hero-cell-size) / 2)`, top: `calc(${Math.floor(accent.cell / 8)} * (var(--hero-cell-size) + var(--hero-cell-gap)))` }}>
          <div className="hero-block-readout">
            <span className="text-primary"><span className="text-brand-gold">&gt;</span> block <span className="text-muted">#</span>{block.height.toLocaleString('en-US')}</span>
            <span className="block text-muted">{block.hash.slice(0, 8)}…{block.hash.slice(-8)}</span>
          </div>
        </div>
      </>}
    </div>
  );
}
