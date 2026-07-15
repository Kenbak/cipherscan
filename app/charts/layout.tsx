import { buildPageMetadata } from '@/lib/seo';

export const metadata = buildPageMetadata({
  title: 'Zcash Charts & On-Chain Analytics | CipherScan',
  description: 'Explore Zcash charts for shielded pool growth, privacy adoption, mining distribution, fees, and network activity.',
  keywords: ['zcash charts', 'zcash analytics', 'zcash metrics', 'ZEC price chart', 'zcash mining', 'zcash privacy stats', 'shielded pool chart'],
  path: '/charts',
  networks: ['mainnet'],
});

export default function ChartsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
