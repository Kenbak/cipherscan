import NetworkClient, { type NetworkPageInitialData } from './NetworkClient';
import { getApiUrl, getNetwork, getBaseUrl } from '@/lib/seo';
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
  const [stats, health, nodeLocations, nodeStats, recentBlocks, feeDistribution] = await Promise.all([
    fetchJson<NetworkPageInitialData['stats']>(apiBase, '/api/network/stats', 30, network),
    fetchJson<NetworkPageInitialData['health']>(apiBase, '/api/network/health', 60, network),
    fetchJson<NetworkPageInitialData['nodeLocations']>(apiBase, '/api/network/nodes', 300, network),
    fetchJson<NetworkPageInitialData['nodeStats']>(apiBase, '/api/network/nodes/stats', 300, network),
    fetchJson<NetworkPageInitialData['recentBlocks']>(apiBase, '/api/network/blocks/recent?limit=30', 30, network),
    fetchJson<NetworkPageInitialData['feeDistribution']>(apiBase, '/api/network/fee-distribution?period=30d', 300, network),
  ]);
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
