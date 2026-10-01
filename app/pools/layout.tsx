import { buildPageMetadata, getBaseUrl } from '@/lib/seo';

export const metadata = buildPageMetadata({
  title: 'Zcash Shielded Pool Statistics | ZecBlock',
  description: 'Explore Zcash shielded pool balances, public supply, and shielding flows across Ironwood, Orchard, Sapling, and Sprout.',
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
