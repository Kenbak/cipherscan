import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Zcash Privacy Risk Scanner - Detect Deshielding & Batch Patterns | CipherScan',
  description: 'Identify privacy risks in Zcash transactions: round-trip deshielding detection, batch patterns, timing analysis, and amount correlation. Advanced privacy intelligence.',
  keywords: ['zcash privacy risk', 'zcash deshielding', 'zcash batch detection', 'zcash transaction analysis', 'zcash privacy intelligence', 'ZEC privacy scanner', 'zcash round trip detection'],
  openGraph: {
    title: 'Zcash Privacy Risk Scanner | CipherScan',
    description: 'Detect privacy risks in Zcash transactions: deshielding patterns, batch analysis, and timing correlation.',
    url: 'https://cipherscan.app/privacy-risks',
  },
  alternates: {
    canonical: 'https://cipherscan.app/privacy-risks',
  },
};

export default function PrivacyRisksLayout({ children }: { children: React.ReactNode }) {
  return children;
}
