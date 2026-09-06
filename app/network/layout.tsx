import { buildPageMetadata } from '@/lib/seo';

export const metadata = buildPageMetadata({
  title: 'Zcash Network Stats & Node Map | ZecBlock',
  description: 'Explore Zcash protocol parameters, issuance and the next halving, observed nodes, block cadence, hashrate and transaction fees.',
  keywords: ['zcash network stats', 'zcash node map', 'zcash hashrate', 'zcash peers', 'zcash nodes', 'ZEC network', 'zcash difficulty', 'zcash blockchain stats'],
  path: '/network',
  index: true,
});

export default function NetworkLayout({ children }: { children: React.ReactNode }) {
  return children;
}
