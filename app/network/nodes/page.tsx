import { buildPageMetadata, getBaseUrl } from '@/lib/seo';
import NodesClient from './NodesClient';

export const metadata = buildPageMetadata({
  title: 'Zcash Network Nodes | CipherScan',
  description: 'Explore the Zcash peer-to-peer network: observed active nodes, client implementations, version adoption, and geographic distribution.',
  keywords: ['zcash nodes', 'zcash network nodes', 'zcash peer network', 'zebra nodes', 'zakura nodes', 'zcash node map', 'zcash network topology'],
  path: '/network/nodes',
  index: true,
});

export default function NodesPage() {
  const pageUrl = `${getBaseUrl()}/network/nodes`;
  const schema = { '@context': 'https://schema.org', '@type': 'WebPage',
    '@id': `${pageUrl}#webpage`, url: pageUrl, name: 'Zcash Network Nodes',
    description: 'Active Zcash nodes observed through live peer connections and recent crawler handshakes.',
    isPartOf: { '@id': `${getBaseUrl()}/#website` }, publisher: { '@id': 'https://cipherscan.app/#organization' } };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, '\\u003c') }} />
      <NodesClient />

      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
        <div className="border-t border-cipher-border pt-8 max-w-3xl">
          <h2 className="text-sm font-bold font-mono text-secondary mb-3 uppercase tracking-wider">
            About Network Nodes
          </h2>
          <div className="space-y-3 text-sm text-muted leading-relaxed">
            <p>
              This page combines connections reported by our Zcash node with recent
              protocol handshakes from our network crawlers, deduplicated by IP address.
              Peer observations expire after 15 minutes; crawler handshakes expire after
              one hour. This is the active network we observe, not a complete count of
              all nodes or independent operators. Client names and versions are self-reported.
            </p>
            <p>
              DNS and gossiped addresses alone do not count as active. Graph links show
              advertised peer relationships; active nodes without those links still appear.
              Average handshake time covers crawler verifications, not live-peer ping times.
            </p>
            <p>
              Node locations are rounded to 1-degree precision to protect operator privacy.
              No IP addresses or exact coordinates are exposed. Tor hidden service nodes
              appear without geographic placement. This product includes GeoLite2 data
              created by MaxMind, available from{' '}
              <a href="https://www.maxmind.com" className="text-accent hover:underline" rel="noopener noreferrer" target="_blank">
                maxmind.com
              </a>.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
