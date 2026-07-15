import { buildPageMetadata } from '@/lib/seo';

export const metadata = buildPageMetadata({
  title: 'Zcash API Documentation | CipherScan',
  description: 'Use CipherScan\'s free Zcash API to query blocks, transactions, addresses, shielded pools, privacy analytics, and testnet data.',
  keywords: ['cipherscan api', 'zcash api', 'zcash blockchain api', 'zcash rest api', 'ZEC api', 'zcash developer api', 'blockchain api documentation', 'zcash transaction api', 'zcash privacy api', 'zcash supply api', 'zcash shielded pool'],
  path: '/docs',
  networks: ['mainnet'],
});

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
