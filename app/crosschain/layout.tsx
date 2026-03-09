import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Crosschain - ZEC Cross-Chain Swap Analytics | CipherScan',
  description: 'Track ZEC cross-chain swaps via NEAR Intents. Monitor swap volumes, latency, and flow directions across Bitcoin, Ethereum, Solana, and 15+ chains.',
  keywords: ['zcash crosschain', 'ZEC swaps', 'NEAR Intents', 'zcash bridge', 'ZEC cross-chain', 'zcash swap volume', 'ZEC latency'],
  openGraph: {
    title: 'Crosschain - ZEC Cross-Chain Swap Analytics | CipherScan',
    description: 'Track ZEC cross-chain swaps via NEAR Intents across Bitcoin, Ethereum, Solana, and more.',
    url: 'https://cipherscan.app/crosschain',
  },
  alternates: {
    canonical: 'https://cipherscan.app/crosschain',
  },
};

export default function CrosschainLayout({ children }: { children: React.ReactNode }) {
  return children;
}
