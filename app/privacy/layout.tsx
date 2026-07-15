import { buildPageMetadata } from '@/lib/seo';

export const metadata = buildPageMetadata({
  title: 'Zcash Privacy Dashboard & Shielded Pools | CipherScan',
  description: 'Track Zcash privacy with live Orchard, Sapling, and Ironwood pool sizes, shielded transaction activity, and CipherScan privacy metrics.',
  keywords: ['zcash privacy', 'zcash shielded pool', 'zcash privacy score', 'sapling pool', 'orchard pool', 'zcash shielded transactions', 'ZEC privacy stats', 'zcash privacy dashboard'],
  path: '/privacy',
  networks: ['mainnet'],
});

export default function PrivacyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
