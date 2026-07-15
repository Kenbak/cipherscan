import { buildPageMetadata } from '@/lib/seo';

export const metadata = buildPageMetadata({
  title: 'Zcash Shielded Pool Statistics | CipherScan',
  description: 'Track ZEC across the Ironwood, Orchard, Sapling, Sprout, and transparent pools, with shielded supply and flow history.',
  path: '/pools',
  networks: ['mainnet'],
  imageAlt: 'CipherScan Zcash shielded pool statistics',
});

export default function PoolsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
