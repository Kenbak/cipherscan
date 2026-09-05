import { buildPageMetadata } from '@/lib/seo';

export const metadata = buildPageMetadata({
  title: 'Zcash Shielded Pool Statistics | ZecBlock',
  description: 'Track ZEC across the Ironwood, Orchard, Sapling, Sprout, and transparent pools, with shielded supply and flow history.',
  path: '/pools',
  networks: ['mainnet'],
  imageAlt: 'ZecBlock Zcash shielded pool statistics',
});

export default function PoolsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
