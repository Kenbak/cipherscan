import { buildPageMetadata } from '@/lib/seo';

export const metadata = buildPageMetadata({
  title: 'Zcash Miner ZODL Leaderboard | ZecBlock',
  description: 'Compare unspent Zcash mining rewards and their first transfers by pool, including shielding and labeled exchange flows. Transfers do not prove sales.',
  path: '/zodl',
  networks: ['mainnet'],
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
