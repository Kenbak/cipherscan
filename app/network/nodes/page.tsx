import { buildPageMetadata, getBaseUrl } from '@/lib/seo';
import NodesClient from './NodesClient';

export const metadata = buildPageMetadata({
  title: 'Zcash Network Nodes | ZecBlock',
  description: 'Explore the Zcash peer-to-peer network: verified reachable nodes, client implementations, version adoption, and geographic distribution.',
  keywords: ['zcash nodes', 'zcash network nodes', 'zcash peer network', 'zebra nodes', 'zakura nodes', 'zcash node map', 'zcash network topology'],
  path: '/network/nodes',
  index: true,
});

export default function NodesPage() {
  const pageUrl = `${getBaseUrl()}/network/nodes`;
  const schema = {
    '@context': 'https://schema.org', '@type': 'WebPage', '@id': `${pageUrl}#webpage`,
    url: pageUrl, name: 'Zcash Nodes',
    description: 'Observed Zcash nodes, peer advertisements, software adoption, hosting and crawler reachability.',
    isPartOf: { '@id': `${getBaseUrl()}/#website` },
    publisher: { '@id': 'https://zecblock.com/#organization' },
  };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, '\\u003c') }} />
      <NodesClient />

      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
        <div className="border-t border-cipher-border pt-8 max-w-3xl">
          <h2 className="text-sm font-semibold font-mono text-secondary mb-3 lowercase tracking-tight">
            About Network Nodes
          </h2>
          <div className="space-y-3 text-sm text-muted leading-relaxed">
            <p>
              This page describes Zcash nodes observed by ZecBlock&apos;s
              network crawler. Reachable nodes complete a protocol handshake; client and version
              strings are reported by those peers. The topology also includes advertised
              addresses without a recent verified handshake. An edge represents a peer advertisement,
              not a continuously verified connection. Discovery coverage can change between crawls.
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
