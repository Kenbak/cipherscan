import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'CipherScan API Documentation - Zcash Blockchain API',
  description: 'Free REST API for Zcash blockchain data. Query blocks, transactions, addresses, supply pools, privacy analytics, cross-chain swaps, and shielded transaction metrics. Mainnet and testnet supported.',
  keywords: ['cipherscan api', 'zcash api', 'zcash blockchain api', 'zcash rest api', 'ZEC api', 'zcash developer api', 'blockchain api documentation', 'zcash transaction api', 'zcash privacy api', 'zcash supply api', 'zcash shielded pool'],
  openGraph: {
    title: 'CipherScan API Documentation | Zcash Blockchain API',
    description: 'Free REST API for Zcash. Blocks, transactions, addresses, supply pools, privacy analytics, cross-chain swaps, and more.',
    url: 'https://cipherscan.app/docs',
    type: 'website',
    siteName: 'CipherScan',
  },
  twitter: {
    card: 'summary',
    title: 'CipherScan API Documentation',
    description: 'Free REST API for Zcash blockchain data. Blocks, transactions, privacy analytics, supply, and more.',
  },
  alternates: {
    canonical: 'https://cipherscan.app/docs',
  },
};

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
