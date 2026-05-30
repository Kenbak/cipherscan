import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Shielded Zcash Transactions - Sapling & Orchard Explorer | CipherScan',
  description: 'Browse shielded Zcash transactions. Filter by Sapling or Orchard pool, fully-shielded or partially-shielded. Track private ZEC activity.',
  keywords: ['zcash shielded transactions', 'zcash orchard', 'zcash sapling', 'shielded ZEC', 'zcash privacy', 'fully shielded'],
  openGraph: {
    title: 'Shielded Zcash Transactions | CipherScan',
    description: 'Browse shielded Zcash transactions. Filter by Sapling or Orchard pool.',
    url: 'https://cipherscan.app/txs/shielded',
  },
  alternates: {
    canonical: 'https://cipherscan.app/txs/shielded',
  },
};

export default function ShieldedTxsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
