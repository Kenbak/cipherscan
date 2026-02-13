import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'CipherScan API Documentation - Zcash Blockchain API Reference',
  description: 'CipherScan REST API documentation for developers. Query Zcash blocks, transactions, addresses, mempool, network stats, privacy metrics, and supply data programmatically.',
  keywords: ['cipherscan api', 'zcash api', 'zcash blockchain api', 'zcash rest api', 'ZEC api', 'zcash developer api', 'blockchain api documentation', 'zcash transaction api'],
  openGraph: {
    title: 'CipherScan API Documentation | Zcash Blockchain API',
    description: 'REST API for querying Zcash blockchain data: blocks, transactions, addresses, and privacy metrics.',
    url: 'https://cipherscan.app/docs',
  },
  alternates: {
    canonical: 'https://cipherscan.app/docs',
  },
};

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
