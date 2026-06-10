import { API_CONFIG } from '@/lib/api-config';
import BlocksClient from './BlocksClient';

const API_URL = API_CONFIG.POSTGRES_API_URL;
const PAGE_SIZE = 25;

async function getInitialBlocks() {
  try {
    const res = await fetch(`${API_URL}/api/blocks/list?limit=${PAGE_SIZE + 1}`, {
      cache: 'no-store',
    });
    if (!res.ok) return { blocks: [], trailingBlock: null, pagination: null };

    const json = await res.json();
    if (!json.success) return { blocks: [], trailingBlock: null, pagination: null };

    const all = json.blocks || [];
    return {
      blocks: all.slice(0, PAGE_SIZE),
      trailingBlock: all.length > PAGE_SIZE ? all[PAGE_SIZE] : null,
      pagination: json.pagination ?? null,
    };
  } catch (error) {
    console.error('Error fetching initial blocks:', error);
    return { blocks: [], trailingBlock: null, pagination: null };
  }
}

export default async function BlocksPage() {
  const { blocks, trailingBlock, pagination } = await getInitialBlocks();

  return (
    <>
      <BlocksClient
        initialBlocks={blocks}
        initialTrailingBlock={trailingBlock}
        initialPagination={pagination}
      />

      {/* Static page description — server-rendered for indexing */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
        <div className="border-t border-cipher-border pt-8 max-w-3xl">
          <h2 className="text-sm font-bold font-mono text-secondary mb-3 uppercase tracking-wider">
            About Zcash Blocks
          </h2>
          <div className="space-y-3 text-sm text-muted leading-relaxed">
            <p>
              Zcash produces a new block roughly every 75 seconds. Each block bundles
              transparent and shielded transactions, a coinbase reward for the miner, and a
              commitment to the current state of the shielded pools. CipherScan indexes every
              block directly from a Zebra full node, so heights, hashes, sizes, and intervals
              on this page reflect the canonical chain in real time.
            </p>
            <p>
              The interval column tracks the spacing between consecutive blocks — useful for
              spotting hashrate swings or unusually slow blocks. Click any height or hash to
              inspect the full block: its transactions, miner, difficulty, and shielded
              activity.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
