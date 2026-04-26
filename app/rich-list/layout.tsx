import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Rich List — Top Zcash Addresses by Balance | CipherScan',
  description: 'Explore the top Zcash transparent addresses ranked by balance. See labeled exchanges, mining pools, and supply concentration stats.',
  keywords: ['zcash rich list', 'zcash top addresses', 'zcash whales', 'ZEC balance', 'zcash exchanges', 'zcash supply distribution'],
  openGraph: {
    title: 'Zcash Rich List | CipherScan',
    description: 'Top transparent addresses ranked by balance with labeled entities.',
    url: 'https://cipherscan.app/rich-list',
  },
  alternates: {
    canonical: 'https://cipherscan.app/rich-list',
  },
};

export default function RichListLayout({ children }: { children: React.ReactNode }) {
  return children;
}
