import { buildPageMetadata } from '@/lib/seo';

export const metadata = buildPageMetadata({
  title: 'Zcash Crosslink Fork Monitor | CipherScan',
  description: 'Compare Crosslink test nodes, verify reference block hashes, and monitor active feature-network forks.',
  path: '/fork-monitor',
  index: false,
  networks: ['crosslink-testnet'],
  imageAlt: 'CipherScan Zcash Crosslink fork monitor',
});

export default function ForkMonitorLayout({ children }: { children: React.ReactNode }) {
  return children;
}
