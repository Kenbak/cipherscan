'use client';

import { CrosslinkChainGraph } from '@/components/CrosslinkChainGraph';

export default function ChainViewPage() {
  return (
    <div className="max-w-[1400px] mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 animate-fade-in">
      <div className="mb-4 sm:mb-6">
        <p className="text-xs text-muted font-mono uppercase tracking-widest mb-1.5">
          <span className="opacity-50">{'>'}</span> CHAIN_VIEW
        </p>
        <div className="flex items-end gap-4 flex-wrap justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold text-primary tracking-tight">
              Crosslink dual chain
            </h1>
            <p className="text-sm text-secondary mt-1.5 max-w-2xl leading-relaxed">
              Two chains running in parallel. Miners (PoW, left) produce blocks.
              Finalizers (BFT, right) vote to lock them in as final.
            </p>
          </div>
          <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-muted">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cipher-green opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-cipher-green" />
            </span>
            <span>live · refreshes every 10s</span>
          </div>
        </div>
      </div>

      <CrosslinkChainGraph initialBlocksToShow={40} />
    </div>
  );
}
