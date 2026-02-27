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
  finality?: string | null;
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

export const metadata = {
  title: 'CipherScan - Zcash Blockchain Explorer',
  description: 'Explore the Zcash blockchain with CipherScan. Search blocks, transactions, and addresses. View shielded pool stats, privacy scores, and network health. Fast, open-source, and privacy-first.',
  openGraph: {
    title: 'CipherScan - Zcash Blockchain Explorer',
    description: 'Explore the Zcash blockchain with CipherScan. Search blocks, transactions, and addresses. View shielded pool stats, privacy scores, and network health.',
  },
};

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
        <h1 className="text-xl sm:text-2xl lg:text-3xl font-semibold text-primary mb-6 sm:mb-8 animate-fade-in inline-flex items-center justify-center gap-3 tracking-tight">
          <img src="/zec-logo.png" alt="Zcash" className="w-7 h-7 sm:w-8 sm:h-8" />
          Zcash Blockchain Explorer
        </h1>

        {/* Search Section */}
        <div>
          <SearchBar />
        </div>
        <p className="text-xs text-muted mt-4 max-w-lg mx-auto leading-relaxed">
          Search blocks, transactions, and addresses on the Zcash blockchain. Track shielded pool activity, privacy scores, and network health in real time.
        </p>
      </div>

      {/* Privacy Health Module */}
      <div className="relative z-10">
        <PrivacyWidget initialStats={privacyStats} initialRiskStats={riskStats} />
      </div>

      {/* Recent Blocks & Shielded TXs - Side by Side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-8 mt-8 sm:mt-12 lg:mt-16">
          {/* Recent Blocks */}
          <div>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-sm sm:text-base font-bold font-mono text-secondary flex items-center gap-2">
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
          <div>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-sm sm:text-base font-bold font-mono text-secondary flex items-center gap-2">
                <span className="text-muted opacity-50">{'>'}</span>
                SHIELDED_ACTIVITY
              </h2>
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cipher-green opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-cipher-green"></span>
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
