import { buildPageMetadata } from '@/lib/seo';

export const metadata = buildPageMetadata({
  title: 'Zcash API Documentation | ZecBlock',
  description: 'Explore the ZecBlock v1 public API reference: Zcash endpoints, request bodies, pagination, exact amounts, error handling and OpenAPI downloads.',
  keywords: ['cipherscan api', 'zcash api', 'zcash blockchain api', 'zcash rest api', 'ZEC api', 'zcash developer api', 'blockchain api documentation', 'zcash transaction api', 'zcash privacy api', 'zcash supply api', 'zcash shielded pool'],
  path: '/docs',
  networks: ['mainnet'],
  index: true,
});

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
