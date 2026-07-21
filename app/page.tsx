import Link from 'next/link';
import { SearchBar } from '@/components/SearchBar';
import { RecentBlocks } from '@/components/RecentBlocks';
import { RecentShieldedTxs } from '@/components/RecentShieldedTxs';
import { RecentMempool } from '@/components/RecentMempool';
import { CrosslinkStats } from '@/components/CrosslinkStats';
import { CrosslinkChainGraph } from '@/components/CrosslinkChainGraph';
import { StakingDayBanner } from '@/components/StakingDayBanner';
import { API_CONFIG } from '@/lib/api-config';
import { isCrosslink, isTestnet } from '@/lib/config';

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

const crosslinkMode = isCrosslink;

export default async function Home() {
  const [initialBlocks, initialShieldedTxs] = await Promise.all([
    getRecentBlocks(),
    getRecentShieldedTxs(),
  ]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8 lg:py-10">
      {/* Hero Section - z-index for dropdown to appear above widgets */}
      <div className="text-center mb-8 sm:mb-10 relative z-30">
        {/* Tagline - SEO friendly */}
        <h1 className="text-lg sm:text-xl lg:text-2xl font-semibold text-primary mb-2 sm:mb-3 animate-fade-in inline-flex items-center justify-center gap-3 tracking-tight">
          <img src="/zec-logo.png" alt="Zcash" className="w-7 h-7 sm:w-8 sm:h-8" />
          {crosslinkMode
            ? 'CipherScan: Zcash Crosslink Explorer'
            : isTestnet
              ? 'CipherScan: Zcash Testnet Explorer (TAZ)'
              : 'CipherScan: Zcash Block Explorer'}
        </h1>
        <p className="text-xs sm:text-sm text-muted/60 mb-5 sm:mb-6 max-w-lg mx-auto text-center leading-relaxed">
          {crosslinkMode
            ? 'Explore the Zcash Crosslink hybrid PoW/PoS feature net. Track finality, staking windows, validators, and blocks in real time.'
            : isTestnet
              ? 'Search TAZ blocks, transactions, and addresses on the Zcash testnet. Monitor pending transactions and network activity before using mainnet.'
              : 'Explore blocks, transactions, and addresses on the Zcash blockchain. Track shielded pool activity, privacy scores, and network health — all in real time.'}
        </p>

        {/* Search Section */}
        <div>
          <SearchBar />
        </div>
      </div>

      {/* Crosslink: Network Stats + Staking Day */}
      {crosslinkMode && (
        <div className="relative z-10 space-y-4">
          <CrosslinkStats />
          <StakingDayBanner />
          <div className="grid grid-cols-2 gap-3">
            <Link
              href="/learn/crosslink"
              className="text-xs font-mono text-muted hover:text-cipher-cyan px-3 py-2.5 rounded-lg border border-white/[0.06] hover:border-cipher-cyan/30 transition-all text-center"
            >
              Learn Crosslink →
            </Link>
            <a
              href="https://github.com/ShieldedLabs/crosslink_monolith/releases/tag/season-1-workshop-1"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-mono text-muted hover:text-cipher-cyan px-3 py-2.5 rounded-lg border border-white/[0.06] hover:border-cipher-cyan/30 transition-all text-center"
            >
              Join Season 1 →
            </a>
          </div>
        </div>
      )}

      {crosslinkMode ? (
        <>
          {/* Hero — embedded dual-chain graph (covers PoW blocks + BFT links) */}
          <div className="mt-8 sm:mt-12 lg:mt-14">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm sm:text-base font-bold font-mono text-secondary flex items-center gap-2">
                <span className="text-muted opacity-50">{'>'}</span>
                CHAIN_VIEW
              </h2>
              <Link
                href="/chain"
                className="text-xs font-mono text-muted hover:text-cipher-cyan transition-colors"
              >
                Open full view →
              </Link>
            </div>
            <CrosslinkChainGraph
              variant="embedded"
              initialBlocksToShow={15}
              height="540px"
            />
          </div>
        </>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8 mt-6 sm:mt-8 lg:mt-10">
          <div>
            <div className="flex items-center justify-between mb-4">
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
            <div className="flex items-center justify-center gap-4 mt-3">
              <Link href="/blocks" className="text-xs font-mono text-muted hover:text-cipher-cyan transition-colors">
                View All Blocks →
              </Link>
              <span className="text-cipher-border">·</span>
              <Link href="/txs" className="text-xs font-mono text-muted hover:text-cipher-cyan transition-colors">
                View All Transactions →
              </Link>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-4">
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
            <Link href="/txs/shielded" className="block mt-3 text-center text-xs font-mono text-muted hover:text-cipher-cyan transition-colors">
              View All Shielded Transactions →
            </Link>
          </div>
        </div>
      )}

      {/* Pending Mempool */}
      <div className="mt-6 sm:mt-8 lg:mt-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm sm:text-base font-bold font-mono text-secondary flex items-center gap-2">
            <span className="text-muted opacity-50">{'>'}</span>
            MEMPOOL
          </h2>
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cipher-green opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-cipher-green"></span>
            </span>
            <span className="text-[10px] sm:text-xs text-muted font-mono uppercase tracking-wider">Live</span>
          </div>
        </div>
        <RecentMempool />
        <Link href="/mempool" className="block mt-3 text-center text-xs font-mono text-muted hover:text-cipher-cyan transition-colors">
          View All Pending Transactions →
        </Link>
      </div>
    </div>
  );
}
