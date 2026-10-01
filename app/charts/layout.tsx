import { buildPageMetadata } from '@/lib/seo';

export const metadata = buildPageMetadata({
  title: 'Zcash Charts & On-Chain Analytics | ZecBlock',
  description: 'Explore and share Zcash charts for shielded supply, transaction activity, mining, fees, valuation and cross-chain swaps, with clear units and data sources.',
  keywords: ['zcash charts', 'zcash analytics', 'zcash metrics', 'ZEC price chart', 'zcash mining', 'zcash privacy stats', 'shielded pool chart'],
  path: '/charts',
  networks: ['mainnet'],
});

export default function ChartsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
