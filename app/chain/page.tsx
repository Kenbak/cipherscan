'use client';

import { CrosslinkChainGraph } from '@/components/CrosslinkChainGraph';

export default function ChainViewPage() {
  return (
    <div className="max-w-[1400px] mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8 animate-fade-in">
      <div className="mb-4 sm:mb-6">
        <p className="text-xs text-muted font-mono uppercase tracking-widest mb-2">
          <span className="opacity-50">{'>'}</span> CHAIN_VIEW
        </p>
        <div className="flex items-center gap-3 flex-wrap justify-between">
          <h1 className="text-2xl sm:text-3xl font-bold text-primary">
            PoW &amp; PoS Chain
          </h1>
          <p className="text-xs text-muted max-w-md text-right hidden md:block">
            Pan · scroll to zoom · hover a BFT node for signer list · click any PoW block to open it
          </p>
        </div>
      </div>

      <CrosslinkChainGraph blocksToShow={40} />

      <p className="text-xs text-muted mt-4 text-center md:hidden">
        Pinch to zoom · tap a BFT node for signer list · tap any PoW block to open it
      </p>
    </div>
  );
}
