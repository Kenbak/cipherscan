import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Chain Reorgs & Orphaned Blocks | CipherScan',
  description: 'Monitor Zcash chain reorganizations, orphaned blocks, and competing forks in real time. Track reorg depth, affected miners, and consensus splits.',
  keywords: ['zcash reorg', 'zcash orphaned blocks', 'zcash uncle blocks', 'zcash chain fork', 'zcash consensus'],
  openGraph: {
    title: 'Chain Reorgs & Orphaned Blocks | CipherScan',
    description: 'Monitor Zcash chain reorganizations and orphaned blocks in real time.',
    url: 'https://cipherscan.app/reorgs',
  },
  alternates: {
    canonical: 'https://cipherscan.app/reorgs',
  },
};

export default function UnclesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
