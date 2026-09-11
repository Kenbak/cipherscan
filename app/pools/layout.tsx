import { getBaseUrl, buildPageMetadata } from '@/lib/seo';

export const metadata = buildPageMetadata({
  title: 'Zcash Shielded Pool Statistics | CipherScan',
  description: 'Track ZEC across the Ironwood, Orchard, Sapling, Sprout, and transparent pools, with shielded supply and flow history.',
  path: '/pools',
  networks: ['mainnet'],
  index: true,
  imageAlt: 'CipherScan Zcash shielded pool statistics',
});

export default function PoolsLayout({ children }: { children: React.ReactNode }) {
  const url = `${getBaseUrl()}/pools`;
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    '@id': `${url}#webpage`,
    url,
    name: 'Zcash Shielded Pool Statistics',
    description: 'Public supply (transparent balances and other issued value), shielded and unmined ZEC against the 21 million cap, with pool history and public flows.',
    isPartOf: { '@id': `${getBaseUrl()}/#website` },
    publisher: { '@id': 'https://cipherscan.app/#organization' },
  };
  return <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, '\\u003c') }} />
    {children}
  </>;
}
