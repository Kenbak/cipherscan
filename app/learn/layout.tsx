import { buildPageMetadata } from '@/lib/seo';

export const metadata = buildPageMetadata({
  title: 'Learn Zcash: Wallets, Privacy & Resources | ZecBlock',
  description: 'Learn how Zcash privacy works, explore wallets and ways to get ZEC, and find resources for running a node or building on the network.',
  keywords: ['learn zcash', 'zcash guide', 'zcash tutorial', 'what is zcash', 'zcash privacy', 'zero knowledge proofs', 'zcash shielded transactions explained', 'ZEC beginner guide', 'zcash education'],
  path: '/learn',
  networks: ['mainnet'],
  index: true,
});

export default function LearnLayout({ children }: { children: React.ReactNode }) {
  return children;
}
