import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Latest Zcash Blocks - Block Explorer | CipherScan',
  description: 'Browse the latest Zcash blocks with transaction counts, sizes, mining rewards, and timestamps. Real-time block explorer data.',
  keywords: ['zcash blocks', 'zcash block explorer', 'zcash latest blocks', 'ZEC blocks', 'zcash block height'],
  openGraph: {
    title: 'Latest Zcash Blocks | CipherScan',
    description: 'Browse the latest Zcash blocks with transaction counts, sizes, and mining rewards.',
    url: 'https://cipherscan.app/blocks',
  },
  alternates: {
    canonical: 'https://cipherscan.app/blocks',
  },
};

export default function BlocksLayout({ children }: { children: React.ReactNode }) {
  return children;
}
