import { buildPageMetadata } from '@/lib/seo';

export const metadata = buildPageMetadata({
  title: 'Zcash Privacy Score & Shielded Usage | ZecBlock',
  description: 'Understand the Zcash Privacy Score: weighted shielded usage, fully shielded transaction share, supply depth, reshielding and historical trends.',
  keywords: ['zcash privacy', 'zcash shielded pool', 'zcash privacy score', 'sapling pool', 'orchard pool', 'zcash shielded transactions', 'ZEC privacy stats', 'zcash privacy dashboard'],
  path: '/privacy',
  index: true,
  networks: ['mainnet'],
});

export default function PrivacyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
