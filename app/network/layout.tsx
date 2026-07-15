import { buildPageMetadata } from '@/lib/seo';

export const metadata = buildPageMetadata({
  title: 'Zcash Network Stats & Node Map | CipherScan',
  description: 'Track Zcash network health with live node locations, hashrate, difficulty, peer counts, and blockchain statistics.',
  keywords: ['zcash network stats', 'zcash node map', 'zcash hashrate', 'zcash peers', 'zcash nodes', 'ZEC network', 'zcash difficulty', 'zcash blockchain stats'],
  path: '/network',
});

export default function NetworkLayout({ children }: { children: React.ReactNode }) {
  return children;
}
