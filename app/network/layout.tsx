import { buildPageMetadata } from '@/lib/seo';

export const metadata = buildPageMetadata({
  title: 'Zcash Network Stats & Node Map | ZecBlock',
  description: 'Explore observed Zcash nodes, recent block cadence, network hashrate and transaction fees, with clearly scoped chain and node statistics.',
  keywords: ['zcash network stats', 'zcash node map', 'zcash hashrate', 'zcash peers', 'zcash nodes', 'ZEC network', 'zcash difficulty', 'zcash blockchain stats'],
  path: '/network',
  index: true,
});

export default function NetworkLayout({ children }: { children: React.ReactNode }) {
  return children;
}
