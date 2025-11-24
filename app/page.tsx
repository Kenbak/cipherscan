import Image from 'next/image';
import { SearchBar } from '@/components/SearchBar';
import { PrivacyWidget } from '@/components/PrivacyWidget';
import { RecentBlocks } from '@/components/RecentBlocks';
import { RecentShieldedTxs } from '@/components/RecentShieldedTxs';
import { DonateButton } from '@/components/DonateButton';
import { isMainnet } from '@/lib/config';

interface Block {
  height: number;
  hash: string;
  timestamp: number;
  transactions: number;
  size: number;
}

// Fetch blocks server-side
async function getRecentBlocks(): Promise<Block[]> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const response = await fetch(`${baseUrl}/api/blocks?limit=5`, {
      next: { revalidate: 0 }, // Always fetch fresh data
      cache: 'no-store', // Don't cache
    });

    if (!response.ok) {
      console.error('Failed to fetch blocks:', response.status);
      return [];
    }

    const data = await response.json();
    return data.blocks || [];
  } catch (error) {
    console.error('Error fetching blocks:', error);
    return [];
  }
}

export default async function Home() {
  // Fetch blocks server-side (no loading state needed!)
  const initialBlocks = await getRecentBlocks();

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-16">
      {/* Hero Section */}
      <div className="text-center mb-12 sm:mb-16 animate-fade-in">
        <p className="text-lg sm:text-2xl text-gray-500 font-mono mb-4 sm:mb-6">
          Zcash Blockchain Explorer
        </p>
        <div className="text-base sm:text-xl text-gray-300 max-w-2xl mx-auto mb-8 sm:mb-12 px-4">
          Decode the blockchain.{' '}
          <span className="relative inline-block group/privacy">
            <span className="text-cipher-cyan cursor-help transition-all duration-300 group-hover/privacy:text-white group-hover/privacy:drop-shadow-[0_0_12px_rgba(6,182,212,0.8)] underline decoration-cipher-cyan/30 decoration-dotted underline-offset-4 group-hover/privacy:decoration-cipher-cyan">
              Privacy
            </span>
            {/* Cypherpunk Tooltip - Minimal & Compact */}
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 opacity-0 invisible group-hover/privacy:opacity-100 group-hover/privacy:visible transition-all duration-300 z-[100] pointer-events-none w-[240px] sm:w-[280px]">
              <div className="bg-black/95 backdrop-blur-sm border border-cipher-cyan/50 rounded-md p-3 shadow-xl shadow-cipher-cyan/10 relative">
                {/* Subtle scan line effect */}
                <div className="absolute inset-0 overflow-hidden rounded-md opacity-10">
                  <div className="absolute w-full h-[1px] bg-gradient-to-r from-transparent via-cipher-cyan to-transparent animate-scan"></div>
                </div>

                {/* Content - Compact */}
                <div className="relative text-center">
                  <div className="text-white/90 font-mono text-[10px] sm:text-xs leading-relaxed mb-2">
                    "Privacy is the power to selectively reveal oneself to the world."
                  </div>
                  <div className="text-cipher-cyan/60 font-mono text-[9px] sm:text-[10px] italic">
                    — Eric Hughes, 1993
                  </div>
                </div>

                {/* Arrow */}
                <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-[1px]">
                  <div className="w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[5px] border-t-cipher-cyan/50"></div>
                </div>
              </div>
            </div>
          </span>
          {' '}meets <span className="text-cipher-cyan">transparency</span>.
        </div>

        {/* Search Section */}
        <SearchBar />
      </div>

      {/* Recent Activity */}
      <div className="mt-12 sm:mt-20 max-w-7xl mx-auto">
        {/* Privacy Widget */}
        <PrivacyWidget />

          {/* Recent Blocks & Shielded TXs - Side by Side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8 mt-12 sm:mt-16">
            {/* Recent Blocks */}
            <div>
              <div className="flex items-center justify-between mb-4 sm:mb-6">
                <h2 className="text-base sm:text-xl font-bold font-mono text-cipher-cyan">
                  {'>'} RECENT_BLOCKS
                </h2>
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-cipher-green rounded-full animate-pulse"></div>
                  <span className="text-xs sm:text-sm text-gray-400 font-mono">LIVE</span>
                </div>
              </div>
              <RecentBlocks initialBlocks={initialBlocks} />
            </div>

            {/* Recent Shielded TXs */}
            <div>
              <div className="flex items-center justify-between mb-4 sm:mb-6">
                <h2 className="text-base sm:text-xl font-bold font-mono text-purple-400">
                  {'>'} SHIELDED_ACTIVITY
                </h2>
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-purple-400 rounded-full animate-pulse"></div>
                  <span className="text-xs sm:text-sm text-gray-400 font-mono">LIVE</span>
                </div>
              </div>
              <RecentShieldedTxs />
            </div>
          </div>

        {/* Privacy Note */}
        <div className="text-center mt-12 pt-8 border-t border-cipher-border/30">
          <p className="text-sm text-gray-500 font-mono flex items-center justify-center">
            <span className="mr-2">🛡️</span>
            Zcash shielded transactions remain private. This explorer shows public data only.
          </p>
        </div>
      </div>
    </div>
  );
}
