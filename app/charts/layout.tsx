import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Zcash Charts & Analytics — On-Chain Metrics, Privacy, Mining | CipherScan',
  description: 'Interactive charts for every Zcash on-chain metric: privacy adoption, shielded pool growth, mining distribution, fee trends, network activity, and more.',
  keywords: ['zcash charts', 'zcash analytics', 'zcash metrics', 'ZEC price chart', 'zcash mining', 'zcash privacy stats', 'shielded pool chart'],
  openGraph: {
    title: 'Zcash Charts & Analytics | CipherScan',
    description: 'Interactive charts for every on-chain metric. Privacy, mining, pools, fees, and network activity.',
    url: 'https://cipherscan.app/charts',
  },
  alternates: {
    canonical: 'https://cipherscan.app/charts',
  },
};

export default function ChartsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
