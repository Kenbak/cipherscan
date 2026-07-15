import { buildPageMetadata } from '@/lib/seo';

export const metadata = buildPageMetadata({
  title: 'Zcash Crosslink Dual-Chain Monitor | CipherScan',
  description: 'Monitor Crosslink proof-of-work blocks and BFT finality votes together on the CipherScan feature-network explorer.',
  path: '/chain',
  index: false,
  networks: ['crosslink-testnet'],
  imageAlt: 'CipherScan Zcash Crosslink dual-chain monitor',
});

export default function ChainLayout({ children }: { children: React.ReactNode }) {
  return children;
}
