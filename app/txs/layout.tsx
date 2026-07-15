import { buildPageMetadata } from '@/lib/seo';

export const metadata = buildPageMetadata({
  title: 'Latest Zcash Transactions - Transaction Explorer | CipherScan',
  description: 'Browse the latest Zcash transactions including shielded, transparent, and coinbase transactions. Real-time transaction explorer.',
  keywords: ['zcash transactions', 'zcash transaction explorer', 'ZEC transactions', 'zcash shielded transactions', 'zcash tx'],
  path: '/txs',
});

export default function TransactionsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
