import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Latest Zcash Transactions - Transaction Explorer | CipherScan',
  description: 'Browse the latest Zcash transactions including shielded, transparent, and coinbase transactions. Real-time transaction explorer.',
  keywords: ['zcash transactions', 'zcash transaction explorer', 'ZEC transactions', 'zcash shielded transactions', 'zcash tx'],
  openGraph: {
    title: 'Latest Zcash Transactions | CipherScan',
    description: 'Browse the latest Zcash transactions including shielded, transparent, and coinbase transactions.',
    url: 'https://cipherscan.app/txs',
  },
  alternates: {
    canonical: 'https://cipherscan.app/txs',
  },
};

export default function TransactionsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
