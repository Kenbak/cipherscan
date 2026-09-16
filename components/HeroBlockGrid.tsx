'use client';

import { useEffect, useRef, useState } from 'react';

const CELL_COUNT = 20;

/** Decorative brand motif, independent of block production or network activity. */
export function HeroBlockGrid() {
  const gridRef = useRef<HTMLDivElement>(null);
  const [activeCell, setActiveCell] = useState<number | null>(null);

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const desktop = window.matchMedia('(min-width: 1024px)');
    let visible = false;
    let previous = 7;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const canAnimate = () => visible && desktop.matches && !motion.matches && !document.hidden;
    const pulse = () => {
      if (!canAnimate()) return;
      // Pick a different cell, only after the previous 4.2s fade has finished.
      previous = (previous + 1 + Math.floor(Math.random() * (CELL_COUNT - 1))) % CELL_COUNT;
      setActiveCell(previous);
      timer = setTimeout(pulse, 6500 + Math.random() * 2500);
    };
    const sync = () => {
      clearTimeout(timer);
      setActiveCell(null);
      if (canAnimate()) timer = setTimeout(pulse, 1200);
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      sync();
    });
    observer.observe(grid);
    motion.addEventListener('change', sync);
    desktop.addEventListener('change', sync);
    document.addEventListener('visibilitychange', sync);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
      motion.removeEventListener('change', sync);
      desktop.removeEventListener('change', sync);
      document.removeEventListener('visibilitychange', sync);
    };
  }, []);

  return (
    <div ref={gridRef} className="hero-block-grid" aria-hidden="true">
      {Array.from({ length: CELL_COUNT }, (_, index) => (
        <span key={index} className="hero-block-cell" data-active={index === activeCell ? '' : undefined} />
      ))}
    </div>
  );
}
