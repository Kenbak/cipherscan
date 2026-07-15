import { buildPageMetadata } from '@/lib/seo';

export const metadata = buildPageMetadata({
  title: 'Shielded Zcash Transactions - Sapling & Orchard Explorer | CipherScan',
  description: 'Browse shielded Zcash transactions. Filter by Sapling or Orchard pool, fully-shielded or partially-shielded. Track private ZEC activity.',
  keywords: ['zcash shielded transactions', 'zcash orchard', 'zcash sapling', 'shielded ZEC', 'zcash privacy', 'fully shielded'],
  path: '/txs/shielded',
});

export default function ShieldedTxsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
