import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Zcash Privacy Dashboard - Shielded Pool Stats & Privacy Score | CipherScan',
  description: 'Real-time Zcash privacy metrics: shielded pool sizes, privacy score, shielding/deshielding trends, Sapling & Orchard adoption rates. Track Zcash privacy health.',
  keywords: ['zcash privacy', 'zcash shielded pool', 'zcash privacy score', 'sapling pool', 'orchard pool', 'zcash shielded transactions', 'ZEC privacy stats', 'zcash privacy dashboard'],
  openGraph: {
    title: 'Zcash Privacy Dashboard | CipherScan',
    description: 'Track Zcash privacy health: shielded pool sizes, privacy score, and adoption trends.',
    url: 'https://cipherscan.app/privacy',
  },
  alternates: {
    canonical: 'https://cipherscan.app/privacy',
  },
};

export default function PrivacyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
