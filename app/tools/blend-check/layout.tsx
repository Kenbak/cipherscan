import { buildPageMetadata } from '@/lib/seo';

export const metadata = buildPageMetadata({
  title: 'Blend Check | CipherScan',
  description: 'See how common a ZEC amount is on the Zcash blockchain. Use popular amounts to blend in with the crowd.',
  keywords: ['zcash', 'privacy', 'blend', 'amount', 'shielded', 'transaction', 'common'],
  path: '/tools/blend-check',
  networks: ['mainnet'],
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
