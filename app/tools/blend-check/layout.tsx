import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Blend Check | CipherScan',
  description: 'See how common a ZEC amount is on the Zcash blockchain. Use popular amounts to blend in with the crowd.',
  keywords: ['zcash', 'privacy', 'blend', 'amount', 'shielded', 'transaction', 'common'],
  openGraph: {
    title: 'Blend Check | CipherScan',
    description: 'See how common a ZEC amount is on the Zcash blockchain.',
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
