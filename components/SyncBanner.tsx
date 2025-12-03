'use client';

import { useState, useEffect } from 'react';

interface BlockInfo {
  height: number;
  timestamp: number;
}

export function SyncBanner() {
  const [lastBlock, setLastBlock] = useState<BlockInfo | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLastBlock = async () => {
      try {
        const baseUrl = process.env.NEXT_PUBLIC_API_URL || '';
        const response = await fetch(`${baseUrl}/api/blocks?limit=1`);
        if (response.ok) {
          const data = await response.json();
          if (data.blocks && data.blocks.length > 0) {
            setLastBlock({
              height: data.blocks[0].height,
              timestamp: data.blocks[0].timestamp,
            });
          }
        }
      } catch (error) {
        console.error('Failed to fetch last block:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchLastBlock();
    const interval = setInterval(fetchLastBlock, 60000);
    return () => clearInterval(interval);
  }, []);

  const now = Math.floor(Date.now() / 1000);
  const lastBlockTime = lastBlock?.timestamp || now;
  const secondsBehind = now - lastBlockTime;
  const hoursBehind = secondsBehind / 3600;

  // Consider synced if last block is less than 30 minutes old
  const isSyncing = hoursBehind > 0.5;

  if (loading || dismissed || !isSyncing) {
    return null;
  }

  // Estimate sync percentage based on time
  const ZCASH_GENESIS_TIMESTAMP = 1477641360; // Oct 28, 2016
  const ZCASH_BLOCK_TIME = 75; // seconds
  const expectedHeight = Math.floor((now - ZCASH_GENESIS_TIMESTAMP) / ZCASH_BLOCK_TIME);
  const actualHeight = lastBlock?.height || 0;
  const syncPercentage = expectedHeight > 0 ? Math.min(100, (actualHeight / expectedHeight) * 100) : 100;

  return (
    <div className="w-full bg-amber-900/40 border-b border-amber-500/30">
      <div className="flex items-center">
        {/* Content */}
        <div className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex items-center gap-2 text-xs sm:text-sm font-mono mb-2">
            <svg
              className="w-4 h-4 text-amber-400 animate-spin flex-shrink-0"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span className="text-amber-300 font-semibold">
              ⚠️ Mainnet Indexer Syncing
            </span>
            <span className="text-amber-200/60 hidden sm:inline">—</span>
            <span className="text-amber-200/70 hidden sm:inline text-xs">
              Some features may be incomplete
            </span>
          </div>

          {/* Progress bar */}
          <div className="flex items-center gap-3">
            <div className="flex-1 bg-black/40 rounded-full h-2 border border-amber-700/30">
              <div
                className="bg-gradient-to-r from-amber-500 to-orange-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.max(5, syncPercentage)}%` }}
              />
            </div>
            <span className="text-xs font-mono text-amber-300 whitespace-nowrap">
              {syncPercentage.toFixed(1)}%
            </span>
          </div>
        </div>

        {/* Dismiss button - edge aligned */}
        <button
          onClick={() => setDismissed(true)}
          className="self-stretch px-4 text-amber-400/60 hover:text-amber-300 hover:bg-amber-800/30 transition-colors flex items-center"
          aria-label="Dismiss"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
