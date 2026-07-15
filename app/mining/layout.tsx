import { buildPageMetadata } from '@/lib/seo';

export const metadata = buildPageMetadata({
  title: 'Zcash Mining Statistics & Pool Distribution | CipherScan',
  description: 'Explore Zcash hashrate, mining pool distribution, block production, miner rankings, fees, and miner reward flows.',
  path: '/mining',
  networks: ['mainnet'],
  imageAlt: 'CipherScan Zcash mining statistics and pool distribution',
});

export default function MiningLayout({ children }: { children: React.ReactNode }) {
  return children;
}
