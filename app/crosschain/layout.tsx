import { buildPageMetadata } from '@/lib/seo';

export const metadata = buildPageMetadata({
  title: 'Crosschain - ZEC Cross-Chain Swap Analytics | CipherScan',
  description: 'Track ZEC cross-chain swaps via NEAR Intents. Monitor swap volumes, latency, and flow directions across Bitcoin, Ethereum, Solana, and 15+ chains.',
  keywords: ['zcash crosschain', 'ZEC swaps', 'NEAR Intents', 'zcash bridge', 'ZEC cross-chain', 'zcash swap volume', 'ZEC latency'],
  path: '/crosschain',
  networks: ['mainnet'],
});

export default function CrosschainLayout({ children }: { children: React.ReactNode }) {
  return children;
}
