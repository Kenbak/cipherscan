import Link from 'next/link';
import Image from 'next/image';
import { SearchBar } from '@/components/SearchBar';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { HomeFeedCard } from '@/components/HomeFeedCard';
import { RecentMempool } from '@/components/RecentMempool';
import { CrosslinkStats } from '@/components/CrosslinkStats';
import { CrosslinkChainGraph } from '@/components/CrosslinkChainGraph.lazy';
import { StakingDayBanner } from '@/components/StakingDayBanner';
import { PulseWidget } from '@/components/PulseWidget';
import { API_CONFIG } from '@/lib/api-config';
import { isCrosslink, isTestnet } from '@/lib/config';
import { fetchWithDeadline } from '@/lib/server-fetch';
import { retainLastGoodOrBuildFallback } from '@/lib/isr-fallback';

export const revalidate = 30;

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
  hasIronwood: boolean;
  saplingSpendCount: number;
  saplingOutputCount: number;
  orchardActions: number;
  ironwoodActions: number;
  vinCount: number;
  voutCount: number;
  valueBalanceSapling: number;
  valueBalanceOrchard: number;
  valueBalanceIronwood: number;
  type: 'fully-shielded' | 'partial';
}

const API_URL = API_CONFIG.POSTGRES_API_URL;

function upstreamError(context: string, status: number): Error {
  return new Error(`${context} returned HTTP ${status}`);
}

async function getRecentBlocks(): Promise<Block[]> {
  try {
    const response = await fetchWithDeadline(`${API_URL}/api/blocks?limit=5`, {
      next: { revalidate: 30, tags: ['chain-tip'] },
    });

    if (!response.ok) throw upstreamError('Recent blocks', response.status);

    const data = await response.json();
    if (!Array.isArray(data.blocks)) throw new Error('Recent blocks payload is malformed');
    return data.blocks.map((b: any) => ({
      height: parseInt(b.height),
      hash: b.hash,
      timestamp: parseInt(b.timestamp),
      transactions: parseInt(b.transaction_count),
      size: parseInt(b.size),
    }));
  } catch (error) {
    console.error('Error fetching blocks:', error);
    return retainLastGoodOrBuildFallback([], error, 'homepage recent blocks');
  }
}

async function getRecentShieldedTxs(): Promise<ShieldedTx[]> {
  try {
    const response = await fetchWithDeadline(`${API_URL}/api/tx/shielded?limit=5`, {
      next: { revalidate: 30, tags: ['chain-tip'] },
    });

    if (!response.ok) throw upstreamError('Recent shielded transactions', response.status);

    const data = await response.json();
    if (!Array.isArray(data.transactions)) {
      throw new Error('Recent shielded transactions payload is malformed');
    }
    return data.transactions;
  } catch (error) {
    console.error('Error fetching shielded txs:', error);
    return retainLastGoodOrBuildFallback([], error, 'homepage recent shielded transactions');
  }
}

const crosslinkMode = isCrosslink;

export default async function Home() {
  const [initialBlocks, initialShieldedTxs] = await Promise.all([
    getRecentBlocks(),
    getRecentShieldedTxs(),
  ]);

  return (
    <div className="home-page max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 lg:py-16">
      {/* Hero Section - z-index for dropdown to appear above widgets */}
      <div className="text-center mb-10 sm:mb-14 relative z-30">
        {/* Tagline - SEO friendly */}
        <h1 className="text-xl sm:text-2xl lg:text-3xl font-semibold text-primary mb-3 sm:mb-4 animate-fade-in inline-flex items-center justify-center gap-3 tracking-tight text-balance">
          <Image
            src="/zec-logo.png"
            alt="Zcash"
            width={32}
            height={32}
            priority
            className="w-7 h-7 sm:w-8 sm:h-8"
          />
          {crosslinkMode
            ? 'CipherScan: Zcash Crosslink Explorer'
            : isTestnet
              ? 'CipherScan: Zcash Testnet Explorer (TAZ)'
              : 'CipherScan: Zcash Block Explorer'}
        </h1>
        <p className="text-sm sm:text-base text-muted/60 mb-7 sm:mb-8 max-w-xl mx-auto text-center leading-relaxed">
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
              className="text-xs font-mono text-muted hover:text-primary px-3 py-2.5 rounded-lg border border-white/[0.06] hover:border-cipher-cyan/30 transition-all text-center"
            >
              Learn Crosslink →
            </Link>
            <a
              href="https://github.com/ShieldedLabs/crosslink_monolith/releases/tag/season-1-workshop-1"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-mono text-muted hover:text-primary px-3 py-2.5 rounded-lg border border-white/[0.06] hover:border-cipher-cyan/30 transition-all text-center"
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
                className="text-xs font-mono text-muted hover:text-primary transition-colors"
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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-10 mt-10 sm:mt-12 lg:mt-16">
          <HomeFeedCard
            storageKey="cipherscan-home-card-left"
            defaultType="blocks"
            initialBlocks={initialBlocks}
          />
          <HomeFeedCard
            storageKey="cipherscan-home-card-right"
            defaultType="shielded"
            initialShieldedTxs={initialShieldedTxs}
          />
        </div>
      )}

      {/* Network Pulse — floating widget */}
      {!crosslinkMode && <PulseWidget />}

      {/* Pending Mempool — fixed, not customizable: always the baseline
          "what's about to confirm" view regardless of what the two cards
          above are set to. */}
      <div className="mt-10 sm:mt-12 lg:mt-16">
        <SectionHeader label="MEMPOOL" live size="lg" />
        <RecentMempool
          footer={
            <Link href="/mempool" className="text-xs sm:text-sm font-mono text-muted hover:text-primary transition-colors">
              View all
            </Link>
          }
        />
      </div>
    </div>
  );
}
