import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Miner ZODL Leaderboard — CipherScan',
  description: 'Which Zcash mining pools stack their block rewards and which sell. A leaderboard ranking pools by how much of their earned ZEC they hold versus spend.',
  openGraph: {
    title: 'Miner ZODL Leaderboard — CipherScan',
    description: 'Which Zcash mining pools are accumulating ZEC, and which are selling.',
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
