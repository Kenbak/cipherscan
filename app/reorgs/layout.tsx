import { buildPageMetadata } from '@/lib/seo';

export const metadata = buildPageMetadata({
  title: 'Zcash Forks & Orphaned Blocks | CipherScan',
  description: 'Monitor Zcash forks, orphaned blocks, competing tips, reorg depth, affected miners, and consensus health in real time.',
  keywords: ['zcash fork', 'zcash reorg', 'zcash orphaned blocks', 'zcash chain fork', 'zcash consensus', 'zcash fork watch'],
  path: '/reorgs',
});

export default function UnclesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
