'use client';

import { useEffect, useRef, useState } from 'react';
import { useWebSocket, type WebSocketMessage } from '@/hooks/useWebSocket';

const CELL_COUNT = 32;

/** A quiet visual response to new blocks received on the shared event feed. */
export function HeroBlockGrid({ initialBlockHash }: { initialBlockHash?: string }) {
  const gridRef = useRef<HTMLDivElement>(null);
  const visibleRef = useRef(false);
  const seenHashes = useRef(new Set(initialBlockHash ? [initialBlockHash.toLowerCase()] : []));
  const [pulse, setPulse] = useState<{ hash: string; cell: number } | null>(null);

  useWebSocket({
    onMessage: (message: WebSocketMessage) => {
      if (message.type !== 'new_block' && message.type !== 'chain_tip') return;
      const hash = message.data?.hash;
      const height = Number(message.data?.height);
      if (typeof hash !== 'string' || !/^[a-f0-9]{64}$/i.test(hash) || !Number.isSafeInteger(height) || height < 0) return;
      const normalized = hash.toLowerCase();
      if (seenHashes.current.has(normalized)) return;
      seenHashes.current.add(normalized);
      if (seenHashes.current.size > 64) {
        const oldest = seenHashes.current.values().next().value;
        if (oldest) seenHashes.current.delete(oldest);
      }
      // Connection snapshots and events received while away are not new-block pulses.
      if (message.type !== 'new_block' || !visibleRef.current || document.hidden) return;
      setPulse({ hash: normalized, cell: parseInt(normalized.slice(-6), 16) % CELL_COUNT });
    },
  });

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const desktop = window.matchMedia('(min-width: 1024px)');
    let inView = false;
    const sync = () => {
      visibleRef.current = inView && desktop.matches && !document.hidden;
      if (!visibleRef.current) setPulse(null);
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
    <div ref={gridRef} className="hero-block-grid" aria-hidden="true">
      {Array.from({ length: CELL_COUNT }, (_, index) => (
        <span key={pulse?.cell === index ? `${index}-${pulse.hash}` : index} className="hero-block-cell" data-active={index === pulse?.cell ? '' : undefined} />
      ))}
    </div>
  );
}
