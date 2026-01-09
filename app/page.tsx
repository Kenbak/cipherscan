import { SearchBar } from '@/components/SearchBar';
import { PrivacyWidget, PrivacyRisksWidget } from '@/components/PrivacyWidget';
import { RecentBlocks } from '@/components/RecentBlocks';
import { RecentShieldedTxs } from '@/components/RecentShieldedTxs';

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
      next: { revalidate: 0 },
      cache: 'no-store',
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
  const initialBlocks = await getRecentBlocks();

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 lg:py-16">
      {/* Hero Section - z-index for dropdown to appear above widgets */}
      <div className="text-center mb-12 sm:mb-16 relative z-30">
        {/* Tagline - SEO friendly */}
        <p className="text-xs sm:text-sm text-muted font-mono uppercase tracking-widest mb-4 animate-fade-in">
          Zcash Blockchain Explorer
        </p>

        {/* Main Headline - More compact */}
        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-8 animate-fade-in" style={{ animationDelay: '50ms' }}>
          <span className="text-primary">Decode the blockchain.</span>
          {' '}
          {/* Privacy with tooltip */}
          <span className="relative group/privacy inline-block">
            <span className="text-purple-400 cursor-help transition-all duration-300 group-hover/privacy:text-white group-hover/privacy:drop-shadow-[0_0_20px_rgba(167,139,250,0.6)]">
              Privacy
            </span>
            {/* Cypherpunk Tooltip */}
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 opacity-0 invisible group-hover/privacy:opacity-100 group-hover/privacy:visible transition-all duration-300 z-[100] pointer-events-none w-[260px] sm:w-[300px]">
              <div className="hero-tooltip backdrop-blur-xl border border-purple-500/40 rounded-lg p-4 shadow-2xl shadow-purple-500/20 relative">
                  {/* Scan line effect */}
                  <div className="absolute inset-0 overflow-hidden rounded-lg opacity-20">
                    <div className="absolute w-full h-[1px] bg-gradient-to-r from-transparent via-purple-400 to-transparent animate-scan"></div>
                  </div>

                  <div className="relative text-center">
                    <div className="hero-tooltip-text font-mono text-xs sm:text-sm leading-relaxed mb-2">
                      "Privacy is the power to selectively reveal oneself to the world."
                    </div>
                    <div className="text-purple-400/60 font-mono text-[10px] sm:text-xs italic">
                      — Eric Hughes, 1993
                    </div>
                  </div>

                  {/* Arrow */}
                  <div className="absolute top-full left-1/2 -translate-x-1/2">
                    <div className="w-0 h-0 border-l-[8px] border-r-[8px] border-t-[8px] border-transparent border-t-purple-500/40"></div>
                  </div>
                </div>
            </div>
          </span>
          {' '}
          <span className="text-primary">meets</span>
          {' '}
            <span className="text-cipher-cyan">transparency</span>
          <span className="text-primary">.</span>
        </h1>

        {/* Search Section */}
        <div className="animate-fade-in-up" style={{ animationDelay: '150ms' }}>
          <SearchBar />
        </div>
      </div>

      {/* Main Content - lower z-index than hero */}
      <div className="space-y-4 relative z-10">
        {/* Privacy Widget */}
        <div className="animate-fade-in-up" style={{ animationDelay: '200ms' }}>
          <PrivacyWidget />
        </div>

        {/* Privacy Risks Widget */}
        <div className="animate-fade-in-up" style={{ animationDelay: '250ms' }}>
          <PrivacyRisksWidget />
        </div>
      </div>

      {/* Recent Blocks & Shielded TXs - Side by Side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8 mt-12 sm:mt-16 lg:mt-20">
          {/* Recent Blocks */}
          <div className="animate-fade-in-up" style={{ animationDelay: '300ms' }}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-sm sm:text-base font-bold font-mono text-cipher-cyan flex items-center gap-2">
                <span className="text-muted opacity-50">{'>'}</span>
                RECENT_BLOCKS
              </h2>
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cipher-green opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-cipher-green"></span>
                </span>
                <span className="text-[10px] sm:text-xs text-muted font-mono uppercase tracking-wider">Live</span>
              </div>
            </div>
            <RecentBlocks initialBlocks={initialBlocks} />
          </div>

          {/* Recent Shielded TXs */}
          <div className="animate-fade-in-up" style={{ animationDelay: '350ms' }}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-sm sm:text-base font-bold font-mono text-purple-400 flex items-center gap-2">
                <span className="text-muted opacity-50">{'>'}</span>
                SHIELDED_ACTIVITY
              </h2>
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-400"></span>
                </span>
                <span className="text-[10px] sm:text-xs text-muted font-mono uppercase tracking-wider">Live</span>
              </div>
            </div>
            <RecentShieldedTxs />
          </div>
        </div>
    </div>
  );
}
