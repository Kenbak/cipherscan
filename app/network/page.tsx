import Link from 'next/link';
import { readApiData } from '@/lib/api-client';
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
    const data = await readApiData(response);
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
  const [stats, health, nodeLocations, nodeStats, recentBlocks, feeDistribution] = await Promise.all([
    fetchJson<NetworkPageInitialData['stats']>(apiBase, '/v1/network/stats', network),
    fetchJson<NetworkPageInitialData['health']>(apiBase, '/v1/network/health', network),
    fetchJson<NetworkPageInitialData['nodeLocations']>(apiBase, '/v1/network/nodes', network),
    fetchJson<NetworkPageInitialData['nodeStats']>(apiBase, '/v1/network/nodes/stats', network),
    fetchJson<NetworkPageInitialData['recentBlocks']>(apiBase, '/v1/network/blocks/recent-summary?limit=30', network),
    fetchJson<NetworkPageInitialData['feeDistribution']>(apiBase, '/v1/network/fee-distribution?period=30d', network),
  ]);
  if (!stats) {
    retainLastGoodOrBuildFallback(null, new Error('Network statistics unavailable'), 'network snapshot');
  }
  const pageUrl = `${getBaseUrl()}/network`;
  const pageSchema = {
    '@context': 'https://schema.org', '@type': 'WebPage', '@id': `${pageUrl}#webpage`,
    url: pageUrl, name: 'Zcash Network',
    description: 'Zcash protocol, issuance, block production and observed nodes.',
    isPartOf: { '@id': `${getBaseUrl()}/#website` },
    publisher: { '@id': 'https://zecblock.com/#organization' },
  };
  return <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(pageSchema).replace(/</g, '\\u003c') }} />
    {network !== 'crosslink-testnet' ? <nav aria-label="Network monitoring" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
      <Link href="/network/attestations" className="text-sm text-cipher-gold hover:underline">Zero Indexer attestation monitor →</Link>
    </nav> : null}
    <NetworkClient initialData={{ fetchedAt, stats, health, nodeLocations, nodeStats, recentBlocks, feeDistribution }} />
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
      <div className="border-t border-cipher-border pt-6 max-w-3xl text-sm text-muted space-y-2">
        <h2 className="font-mono font-medium text-secondary">About these observations</h2>
        <p>Chain statistics, recent blocks and node discovery are separate observations and can update at different times. Block cadence uses timestamps recorded in blocks; these are not measurements of when this explorer received them.</p>
        <p>The map shows observed reachable nodes, not a census of every Zcash node. Peer connections and disk usage in Technical details describe this explorer’s node. Observed transaction fees describe past transactions and are not fee recommendations.</p>
      </div>
    </section>
  </>;
}
