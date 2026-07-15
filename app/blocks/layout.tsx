import { buildPageMetadata } from '@/lib/seo';

export const metadata = buildPageMetadata({
  title: 'Latest Zcash Blocks - Block Explorer | CipherScan',
  description: 'Browse the latest Zcash blocks with transaction counts, sizes, mining rewards, and timestamps. Real-time block explorer data.',
  keywords: ['zcash blocks', 'zcash block explorer', 'zcash latest blocks', 'ZEC blocks', 'zcash block height'],
  path: '/blocks',
});

export default function BlocksLayout({ children }: { children: React.ReactNode }) {
  return children;
}
