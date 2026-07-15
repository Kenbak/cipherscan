import { buildPageMetadata } from '@/lib/seo';

export const metadata = buildPageMetadata({
  title: 'Learn Zcash: Privacy & Shielded Transactions | CipherScan',
  description: 'Learn how Zcash protects transaction privacy, how shielded addresses and pools work, and how to use ZEC safely with practical guides.',
  keywords: ['learn zcash', 'zcash guide', 'zcash tutorial', 'what is zcash', 'zcash privacy', 'zero knowledge proofs', 'zcash shielded transactions explained', 'ZEC beginner guide', 'zcash education'],
  path: '/learn',
  networks: ['mainnet'],
});

export default function LearnLayout({ children }: { children: React.ReactNode }) {
  return children;
}
