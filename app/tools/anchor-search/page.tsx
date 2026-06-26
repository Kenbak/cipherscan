import type { Metadata } from 'next';
import AnchorSearchClient from './AnchorSearchClient';

export const metadata: Metadata = {
  title: 'Anchor Root Search - Wallet Debugging Tool | CipherScan',
  description: 'Search for Sapling and Orchard commitment tree anchor roots across canonical and orphaned blocks. Helps debug wallet sync issues and fork detection.',
  keywords: [
    'zcash anchor root',
    'sapling root search',
    'orchard root search',
    'zcash wallet debugging',
    'zcash fork detection',
    'commitment tree root',
    'zcash reorg',
  ],
  openGraph: {
    title: 'Anchor Root Search | CipherScan',
    description: 'Search Sapling/Orchard anchor roots to debug wallet sync issues.',
    url: 'https://cipherscan.app/tools/anchor-search',
    siteName: 'CipherScan',
    type: 'website',
  },
  alternates: {
    canonical: 'https://cipherscan.app/tools/anchor-search',
  },
};

export default function AnchorSearchPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 animate-fade-in">
      <AnchorSearchClient />
    </div>
  );
}
