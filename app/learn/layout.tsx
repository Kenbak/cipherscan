import { buildPageMetadata } from '@/lib/seo';

export const metadata = buildPageMetadata({
  title: 'Learn Zcash: Wallets, Privacy & Resources | ZecBlock',
  description: 'Learn shielded Zcash, choose Zodl or Vizor, get ZEC with CipherSwap, and explore Zakura, Zebra and resources for the Zcash ecosystem.',
  keywords: ['learn zcash', 'zcash guide', 'zcash tutorial', 'what is zcash', 'zcash privacy', 'zero knowledge proofs', 'zcash shielded transactions explained', 'ZEC beginner guide', 'zcash education'],
  path: '/learn',
  networks: ['mainnet'],
  index: true,
});

export default function LearnLayout({ children }: { children: React.ReactNode }) {
  return children;
}
