import { buildPageMetadata, getBaseUrl } from '@/lib/seo';

export const metadata = buildPageMetadata({
  title: 'Zcash Shielded Pool Statistics | ZecBlock',
  description: 'Track ZEC across the Ironwood, Orchard, Sapling, Sprout, and transparent pools, with shielded supply and flow history.',
  path: '/pools',
  index: true,
  networks: ['mainnet'],
  imageAlt: 'ZecBlock Zcash shielded pool statistics',
});

export default function PoolsLayout({ children }: { children: React.ReactNode }) {
  const url = `${getBaseUrl()}/pools`;
  const schema = {
    '@context': 'https://schema.org', '@type': 'WebPage', '@id': `${url}#webpage`,
    url, name: 'Zcash Shielded Pools',
    description: 'Public supply, shielded pools and remaining issuance against the 21 million ZEC cap, with pool history and public flows.',
    isPartOf: { '@id': `${getBaseUrl()}/#website` },
    publisher: { '@id': 'https://zecblock.com/#organization' },
  };
  return <><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, '\\u003c') }} />{children}</>;
}
