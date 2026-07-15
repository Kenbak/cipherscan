import AnchorSearchClient from './AnchorSearchClient';
import { buildPageMetadata } from '@/lib/seo';

export const metadata = buildPageMetadata({
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
  path: '/tools/anchor-search',
});

export default function AnchorSearchPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 animate-fade-in">
      <AnchorSearchClient />
    </div>
  );
}
