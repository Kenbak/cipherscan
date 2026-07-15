import { buildPageMetadata } from '@/lib/seo';

export const metadata = buildPageMetadata({
  title: 'Miner ZODL Leaderboard — CipherScan',
  description: 'Which Zcash mining pools stack their block rewards and which sell. A leaderboard ranking pools by how much of their earned ZEC they hold versus spend.',
  path: '/zodl',
  networks: ['mainnet'],
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
