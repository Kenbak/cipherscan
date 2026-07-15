import { buildPageMetadata } from '@/lib/seo';

export const metadata = buildPageMetadata({
  title: 'Zcash Crosslink Finalizers & Stake | CipherScan',
  description: 'View the Crosslink finalizer roster, delegated stake, network share, liveness, and recent voting participation.',
  path: '/validators',
  index: false,
  networks: ['crosslink-testnet'],
  imageAlt: 'CipherScan Zcash Crosslink finalizer roster',
});

export default function ValidatorsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
