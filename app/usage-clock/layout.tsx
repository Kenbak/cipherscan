import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'The Rhythm of Zcash — CipherScan',
  description: 'Zcash hides where you are, but the chain still has a pulse. A 24-hour clock of on-chain activity, read against where the network\'s nodes actually run — showing the gap between where the infrastructure sits and when people act.',
  openGraph: {
    title: 'The Rhythm of Zcash — CipherScan',
    description: 'A 24-hour clock of Zcash activity, fused with the network\'s real node geography.',
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
