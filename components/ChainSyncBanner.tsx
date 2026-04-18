'use client';

import { useState, useEffect, useCallback } from 'react';
import { isCrosslinkNetwork } from '@/lib/api-config';

const GAP_THRESHOLD = 10;
const POLL_INTERVAL = 15_000;

export function ChainSyncBanner() {
  const [gap, setGap] = useState<number | null>(null);
  const [tipHeight, setTipHeight] = useState<number | null>(null);
  const [finalizedHeight, setFinalizedHeight] = useState<number | null>(null);

  const poll = useCallback(async () => {
    try {
      const res = await fetch('/api/crosslink');
      if (!res.ok) return;
      const data = await res.json();
      if (data.success && data.finalityGap != null) {
        setGap(data.finalityGap);
        setTipHeight(data.tipHeight ?? null);
        setFinalizedHeight(data.finalizedHeight ?? null);
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (!isCrosslinkNetwork()) return;
    poll();
    const id = setInterval(poll, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [poll]);

  if (!isCrosslinkNetwork() || gap === null || gap <= GAP_THRESHOLD) return null;

  return (
    <div className="bg-amber-500/90 text-black px-4 py-2.5 text-center text-sm font-medium">
      <div className="flex items-center justify-center gap-2 flex-wrap">
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-900/60" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-900" />
        </span>
        <span>
          Chain sync degraded — finality gap is{' '}
          <span className="font-mono font-bold">{gap}</span> blocks
          {tipHeight != null && finalizedHeight != null && (
            <span className="opacity-75">
              {' '}(tip #{tipHeight.toLocaleString()}, finalized #{finalizedHeight.toLocaleString()})
            </span>
          )}
          . Data may be stale.
        </span>
      </div>
    </div>
  );
}
