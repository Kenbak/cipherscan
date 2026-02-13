import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Zcash Mempool Viewer - Pending Transactions in Real-Time | CipherScan',
  description: 'Monitor the Zcash mempool in real-time. View pending transactions, fee rates, and transaction sizes before they are confirmed on the blockchain.',
  keywords: ['zcash mempool', 'zcash pending transactions', 'zcash unconfirmed transactions', 'ZEC mempool', 'zcash transaction pool', 'zcash fee rate'],
  openGraph: {
    title: 'Zcash Mempool Viewer | CipherScan',
    description: 'Real-time view of pending Zcash transactions in the mempool.',
    url: 'https://cipherscan.app/mempool',
  },
  alternates: {
    canonical: 'https://cipherscan.app/mempool',
  },
};

export default function MempoolLayout({ children }: { children: React.ReactNode }) {
  return children;
}
