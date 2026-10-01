import { buildPageMetadata } from '@/lib/seo';

export const metadata = buildPageMetadata({
  title: 'Zcash Privacy Risk Analysis | ZecBlock',
  description: 'Inspect public Zcash amount and timing patterns, candidate transaction links and withdrawal batches. Heuristic signals do not prove ownership.',
  keywords: ['zcash privacy risk', 'zcash deshielding', 'zcash batch detection', 'zcash transaction analysis', 'zcash privacy intelligence', 'ZEC privacy scanner', 'zcash round trip detection'],
  path: '/privacy-risks',
  index: true,
  networks: ['mainnet'],
});

export default function PrivacyRisksLayout({ children }: { children: React.ReactNode }) {
  return children;
}
