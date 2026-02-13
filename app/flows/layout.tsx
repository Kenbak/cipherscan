import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'ZEC Flows - Zcash Shielding & Deshielding Volume Tracker | CipherScan',
  description: 'Track ZEC flows between transparent and shielded pools. Monitor shielding and deshielding volumes, cross-pool transfers, and value movement trends on Zcash.',
  keywords: ['zcash flows', 'ZEC flows', 'zcash shielding volume', 'zcash deshielding', 'zcash pool transfers', 'zcash value movement', 'ZEC cross-pool flows'],
  openGraph: {
    title: 'ZEC Flows - Shielding & Deshielding Tracker | CipherScan',
    description: 'Track ZEC value flows between transparent and shielded pools on the Zcash network.',
    url: 'https://cipherscan.app/flows',
  },
  alternates: {
    canonical: 'https://cipherscan.app/flows',
  },
};

export default function FlowsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
