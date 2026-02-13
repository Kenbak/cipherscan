import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Zcash Network Stats - Node Map, Hashrate & Peer Info | CipherScan',
  description: 'Live Zcash network statistics including node map, hashrate, difficulty, peer count, and global node distribution across 30+ countries. Real-time blockchain metrics.',
  keywords: ['zcash network stats', 'zcash node map', 'zcash hashrate', 'zcash peers', 'zcash nodes', 'ZEC network', 'zcash difficulty', 'zcash blockchain stats'],
  openGraph: {
    title: 'Zcash Network Stats & Node Map | CipherScan',
    description: 'Live Zcash network statistics: node map, hashrate, difficulty, and peer distribution.',
    url: 'https://cipherscan.app/network',
  },
  alternates: {
    canonical: 'https://cipherscan.app/network',
  },
};

export default function NetworkLayout({ children }: { children: React.ReactNode }) {
  return children;
}
