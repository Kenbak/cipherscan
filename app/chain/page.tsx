'use client';

import { CrosslinkChainView } from '@/components/CrosslinkChainView';

export default function ChainViewPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-12 animate-fade-in">
      <div className="mb-6">
        <p className="text-xs text-muted font-mono uppercase tracking-widest mb-3">
          <span className="opacity-50">{'>'}</span> CHAIN_VIEW
        </p>
        <div className="flex items-center gap-3 flex-wrap justify-between">
          <h1 className="text-2xl sm:text-3xl font-bold text-primary">PoW &amp; PoS Chain</h1>
          <div className="flex items-center gap-2 text-xs font-mono text-muted">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cipher-green opacity-60" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-cipher-green" />
            </span>
            <span>live · 10s</span>
          </div>
        </div>
        <p className="text-sm text-secondary mt-2 max-w-2xl">
          PoW blocks on the left, finalization markers on the right. Block card width scales
          with block size — bigger blocks visibly take more space. Green = finalized by BFT,
          orange = currently being voted on, cyan = not yet finalized.
        </p>
      </div>

      <CrosslinkChainView variant="full" blocksToShow={30} />
    </div>
  );
}
