import NetworkClient, { type NetworkPageInitialData } from './NetworkClient';
import { getApiUrl, getNetwork } from '@/lib/seo';
import { fetchWithDeadline } from '@/lib/server-fetch';

async function fetchJson<T>(
  apiBase: string,
  path: string,
  revalidate: number,
  expectedNetwork: string,
): Promise<T | null> {
  try {
    const response = await fetchWithDeadline(`${apiBase}${path}`, {
      next: { revalidate },
    });
    if (!response.ok) return null;
    const data = await response.json();
    if (data?.network && data.network !== expectedNetwork) return null;
    return data as T;
  } catch {
    return null;
  }
}

export default async function NetworkPage() {
  const apiBase = getApiUrl();
  const network = getNetwork();
  const fetchedAt = Date.now();

  const [
    stats,
    health,
    price,
    breakdown,
    halving,
    emission,
    nodeLocations,
    nodeStats,
    recentBlocks,
    poolHistory,
    chainSizeHistory,
    feeDistribution,
    protocolStats,
  ] = await Promise.all([
    fetchJson<NetworkPageInitialData['stats']>(apiBase, '/api/network/stats', 30, network),
    fetchJson<NetworkPageInitialData['health']>(apiBase, '/api/network/health', 60, network),
    fetchJson<NetworkPageInitialData['price']>(apiBase, '/api/price', 60, network),
    fetchJson<NetworkPageInitialData['breakdown']>(
      apiBase,
      '/api/supply/transparent-breakdown',
      300,
      network,
    ),
    fetchJson<NetworkPageInitialData['halving']>(apiBase, '/api/network/halving', 300, network),
    fetchJson<NetworkPageInitialData['emission']>(
      apiBase,
      '/api/network/emission?period=1y',
      300,
      network,
    ),
    fetchJson<NetworkPageInitialData['nodeLocations']>(
      apiBase,
      '/api/network/nodes',
      300,
      network,
    ),
    fetchJson<NetworkPageInitialData['nodeStats']>(
      apiBase,
      '/api/network/nodes/stats',
      300,
      network,
    ),
    fetchJson<NetworkPageInitialData['recentBlocks']>(
      apiBase,
      '/api/network/blocks/recent?limit=15',
      30,
      network,
    ),
    fetchJson<NetworkPageInitialData['poolHistory']>(
      apiBase,
      '/api/network/pool-history?period=all',
      300,
      network,
    ),
    fetchJson<NetworkPageInitialData['chainSizeHistory']>(
      apiBase,
      '/api/network/chain-size-history?period=1y',
      300,
      network,
    ),
    fetchJson<NetworkPageInitialData['feeDistribution']>(
      apiBase,
      '/api/network/fee-distribution?period=30d',
      300,
      network,
    ),
    fetchJson<NetworkPageInitialData['protocolStats']>(
      apiBase,
      '/api/network/protocol-stats',
      300,
      network,
    ),
  ]);

  const initialData: NetworkPageInitialData = {
    fetchedAt,
    stats,
    health,
    price,
    breakdown,
    halving,
    emission,
    nodeLocations,
    nodeStats,
    recentBlocks,
    poolHistory,
    chainSizeHistory,
    feeDistribution,
    protocolStats,
  };

  return (
    <>
      <NetworkClient initialData={initialData} />

      {/* Static page description — server-rendered for indexing */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
        <div className="border-t border-cipher-border pt-8 max-w-3xl">
          <h2 className="text-sm font-bold font-mono text-secondary mb-3 uppercase tracking-wider">
            About the Zcash Network
          </h2>
          <div className="space-y-3 text-sm text-muted leading-relaxed">
            <p>
              Zcash is a proof-of-work blockchain secured by Equihash mining, with a block
              target of 75 seconds and a maximum supply of 21 million ZEC. This page tracks
              the network&apos;s vital signs: chain height, hashrate, difficulty, connected
              peers, observed node-software diversity, and the split of circulating supply
              between the transparent, Sapling, Orchard, and Ironwood pools.
            </p>
            <p>
              Supply numbers distinguish transparent ZEC (publicly auditable, like Bitcoin)
              from shielded ZEC (held in zero-knowledge pools where balances are private but
              the pool totals remain verifiable). Mining pool distribution is derived from
              coinbase markers and shows how concentrated block production currently is.
              Peer software percentages are a sample from CipherScan&apos;s live connections,
              not a complete census of every Zcash node.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
