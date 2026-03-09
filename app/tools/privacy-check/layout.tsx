import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Amount Checker | CipherScan',
  description: 'Check how common a ZEC amount is on the blockchain. Use popular amounts to blend in with the crowd.',
  keywords: ['zcash', 'privacy', 'amount', 'blend', 'shielded', 'transaction'],
  openGraph: {
    title: 'Privacy Amount Checker | CipherScan',
    description: 'Check how common a ZEC amount is on the blockchain.',
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
