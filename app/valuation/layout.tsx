import { buildPageMetadata } from '@/lib/seo';

export const metadata = buildPageMetadata({
  title: 'Zcash On-Chain Valuation Metrics | CipherScan',
  description:
    'Realized price vs market price, MVRV ratio, SOPR, and NUPL for Zcash — Glassnode-level on-chain analytics built from transparent UTXO data.',
  keywords: [
    'zcash MVRV',
    'zcash realized price',
    'zcash valuation',
    'zcash SOPR',
    'zcash NUPL',
    'on-chain analytics zcash',
  ],
  path: '/valuation',
  networks: ['mainnet'],
  imageAlt: 'CipherScan Zcash on-chain valuation metrics',
});

export default function ValuationLayout({ children }: { children: React.ReactNode }) {
  return children;
}
