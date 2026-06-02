import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Fork Watch — Zcash Chain Forks & Orphaned Blocks | CipherScan',
  description: 'Monitor Zcash chain forks, orphaned blocks, and competing tips in real time. Track fork events, reorg lengths, affected miners, and consensus health.',
  keywords: ['zcash fork', 'zcash reorg', 'zcash orphaned blocks', 'zcash chain fork', 'zcash consensus', 'zcash fork watch'],
  openGraph: {
    title: 'Fork Watch — Chain Forks & Orphaned Blocks | CipherScan',
    description: 'Monitor Zcash chain forks and orphaned blocks in real time.',
    url: 'https://cipherscan.app/reorgs',
  },
  alternates: {
    canonical: 'https://cipherscan.app/reorgs',
  },
};

export default function UnclesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
