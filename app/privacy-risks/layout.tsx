import { buildPageMetadata } from '@/lib/seo';

export const metadata = buildPageMetadata({
  title: 'Zcash Privacy Risk Analysis | CipherScan',
  description: 'Find Zcash transactions with timing, amount, deshielding, or batch patterns that may reduce privacy. Explore risk signals on CipherScan.',
  keywords: ['zcash privacy risk', 'zcash deshielding', 'zcash batch detection', 'zcash transaction analysis', 'zcash privacy intelligence', 'ZEC privacy scanner', 'zcash round trip detection'],
  path: '/privacy-risks',
  networks: ['mainnet'],
});

export default function PrivacyRisksLayout({ children }: { children: React.ReactNode }) {
  return children;
}
