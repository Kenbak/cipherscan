import Link from 'next/link';
import { RelativeTimeProvider } from '@/components/RelativeTime';
import NetworkClient, { type NetworkPageInitialData } from './NetworkClient';
import { getApiUrl, getNetwork, getBaseUrl } from '@/lib/seo';
import { fetchWithDeadline } from '@/lib/server-fetch';
import { retainLastGoodOrBuildFallback } from '@/lib/isr-fallback';

// Keep the shared HTML/RSC snapshot inexpensive; browsers refresh live data
// independently. No server fetch may shorten this route's ISR lifetime.
export const revalidate = 300;

async function fetchJson<T>(
  apiBase: string,
  path: string,
  expectedNetwork: string,
): Promise<T | null> {
  try {
    const response = await fetchWithDeadline(`${apiBase}${path}`, {
      next: { revalidate: 300 },
    });
    if (!response.ok) return null;
    const data = await response.json();
    if (typeof data?.network === 'string' && data.network !== expectedNetwork) return null;
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
    fetchJson<NetworkPageInitialData['stats']>(apiBase, '/api/network/stats', network),
    fetchJson<NetworkPageInitialData['health']>(apiBase, '/api/network/health', network),
    fetchJson<NetworkPageInitialData['price']>(apiBase, '/api/price', network),
    fetchJson<NetworkPageInitialData['breakdown']>(
      apiBase,
      '/api/supply/transparent-breakdown',
      network,
    ),
    fetchJson<NetworkPageInitialData['halving']>(apiBase, '/api/network/halving', network),
    fetchJson<NetworkPageInitialData['emission']>(
      apiBase,
      '/api/network/emission?period=1y',
      network,
    ),
    fetchJson<NetworkPageInitialData['nodeLocations']>(
      apiBase,
      '/api/network/nodes',
      network,
    ),
    fetchJson<NetworkPageInitialData['nodeStats']>(
      apiBase,
      '/api/network/nodes/stats',
      network,
    ),
    fetchJson<NetworkPageInitialData['recentBlocks']>(
      apiBase,
      '/api/network/blocks/recent?limit=15',
      network,
    ),
    fetchJson<NetworkPageInitialData['poolHistory']>(
      apiBase,
      '/api/network/pool-history?period=all',
      network,
    ),
    fetchJson<NetworkPageInitialData['chainSizeHistory']>(
      apiBase,
      '/api/network/chain-size-history?period=1y',
      network,
    ),
    fetchJson<NetworkPageInitialData['feeDistribution']>(
      apiBase,
      '/api/network/fee-distribution?period=30d',
      network,
    ),
    fetchJson<NetworkPageInitialData['protocolStats']>(
      apiBase,
      '/api/network/protocol-stats',
      network,
    ),
  ]);

  if (!stats) {
    retainLastGoodOrBuildFallback(null, new Error('Network statistics unavailable'), 'network snapshot');
  }

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

  const pageUrl = `${getBaseUrl()}/network`;
  const pageSchema = {
    '@context': 'https://schema.org', '@type': 'WebPage', '@id': `${pageUrl}#webpage`,
    url: pageUrl, name: 'Zcash Network Overview',
    description: 'Zcash network statistics, supply, mining and observed nodes.',
    isPartOf: { '@id': `${getBaseUrl()}/#website` },
    publisher: { '@id': 'https://cipherscan.app/#organization' },
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(pageSchema).replace(/</g, '\\u003c') }} />
      {network !== 'crosslink-testnet' ? <nav aria-label="Network monitoring" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        <Link href="/network/attestations" className="text-sm text-cipher-cyan hover:underline">Zero Indexer attestation monitor →</Link>
      </nav> : null}
      <RelativeTimeProvider initialNow={fetchedAt}>
        <NetworkClient initialData={initialData} />
      </RelativeTimeProvider>

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
