import { SearchBar } from '@/components/SearchBar';
import { PrivacyWidget, type PrivacyStats, type RiskStats } from '@/components/PrivacyWidget';
import { RecentBlocks } from '@/components/RecentBlocks';
import { RecentShieldedTxs } from '@/components/RecentShieldedTxs';
import { API_CONFIG } from '@/lib/api-config';

interface Block {
  height: number;
  hash: string;
  timestamp: number;
  transactions: number;
  size: number;
}

interface ShieldedTx {
  txid: string;
  blockHeight: number;
  blockTime: number;
  hasSapling: boolean;
  hasOrchard: boolean;
  shieldedSpends: number;
  shieldedOutputs: number;
  orchardActions: number;
  vinCount: number;
  voutCount: number;
  type: 'fully-shielded' | 'partial';
}

const API_URL = API_CONFIG.POSTGRES_API_URL;

async function getRecentBlocks(): Promise<Block[]> {
  try {
    const response = await fetch(`${API_URL}/api/blocks?limit=5`, {
      cache: 'no-store',
    });

    if (!response.ok) return [];

    const data = await response.json();
    return (data.blocks || []).map((b: any) => ({
      height: parseInt(b.height),
      hash: b.hash,
      timestamp: parseInt(b.timestamp),
      transactions: parseInt(b.transaction_count),
      size: parseInt(b.size),
    }));
  } catch (error) {
    console.error('Error fetching blocks:', error);
    return [];
  }
}

async function getRecentShieldedTxs(): Promise<ShieldedTx[]> {
  try {
    const response = await fetch(`${API_URL}/api/tx/shielded?limit=5`, {
      cache: 'no-store',
    });

    if (!response.ok) return [];

    const data = await response.json();
    return data.transactions || [];
  } catch (error) {
    console.error('Error fetching shielded txs:', error);
    return [];
  }
}

async function getPrivacyStats(): Promise<PrivacyStats | null> {
  try {
    const response = await fetch(`${API_URL}/api/privacy-stats`, {
      next: { revalidate: 30 },
    });

    if (!response.ok) return null;

    const result = await response.json();
    return result.success ? result.data : result;
  } catch (error) {
    console.error('Error fetching privacy stats:', error);
    return null;
  }
}

async function getRiskStats(): Promise<RiskStats | null> {
  try {
    const response = await fetch(`${API_URL}/api/privacy/risks?limit=1&period=7d`, {
      next: { revalidate: 30 },
    });

    if (!response.ok) return null;

    const data = await response.json();
    if (data.success && data.stats) {
      return {
        total: data.stats.total,
        highRisk: data.stats.highRisk,
        mediumRisk: data.stats.mediumRisk,
      };
    }
    return null;
  } catch (error) {
    console.error('Error fetching risk stats:', error);
    return null;
  }
}

export default async function Home() {
  const [initialBlocks, initialShieldedTxs, privacyStats, riskStats] = await Promise.all([
    getRecentBlocks(),
    getRecentShieldedTxs(),
    getPrivacyStats(),
    getRiskStats(),
  ]);

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
            {/* Cypherpunk Tooltip — positioned below to avoid navbar overlap */}
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-4 opacity-0 scale-95 -translate-y-2 group-hover/privacy:opacity-100 group-hover/privacy:scale-100 group-hover/privacy:translate-y-0 transition-all duration-300 ease-out z-[100] pointer-events-none w-[280px] sm:w-[320px]">
              <div className="hero-tooltip backdrop-blur-2xl border border-purple-500/30 rounded-xl p-5 shadow-2xl shadow-purple-500/20 relative overflow-hidden">
                {/* Arrow — now on top */}
                <div className="absolute bottom-full left-1/2 -translate-x-1/2">
                  <div className="w-0 h-0 border-l-[8px] border-r-[8px] border-b-[8px] border-transparent border-b-purple-500/30"></div>
                </div>

                {/* Scan line effect */}
                <div className="absolute inset-0 overflow-hidden rounded-xl">
                  <div className="absolute w-full h-[2px] bg-gradient-to-r from-transparent via-purple-400/40 to-transparent animate-scan"></div>
                </div>

                {/* Subtle gradient background */}
                <div className="absolute inset-0 bg-gradient-to-b from-purple-500/5 to-transparent rounded-xl"></div>

                <div className="relative text-center">
                  {/* Quote icon */}
                  <div className="text-purple-400/30 text-2xl font-serif mb-2">&ldquo;</div>
                  <div className="hero-tooltip-text font-mono text-xs sm:text-sm leading-relaxed mb-3">
                    Privacy is the power to selectively reveal oneself to the world.
                  </div>
                  <div className="w-8 h-[1px] bg-purple-400/30 mx-auto mb-2"></div>
                  <div className="text-purple-400/50 font-mono text-[10px] sm:text-xs">
                    Eric Hughes, 1993
                  </div>
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

      {/* Privacy Health Module */}
      <div className="relative z-10 animate-fade-in-up" style={{ animationDelay: '200ms' }}>
        <PrivacyWidget initialStats={privacyStats} initialRiskStats={riskStats} />
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
            <RecentShieldedTxs initialTxs={initialShieldedTxs} />
          </div>
        </div>
    </div>
  );
}
