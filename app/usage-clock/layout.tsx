import { buildPageMetadata } from '@/lib/seo';

export const metadata = buildPageMetadata({
  title: 'The Rhythm of Zcash | CipherScan',
  description: 'Explore Zcash\'s daily activity rhythm on a 24-hour clock and compare when transactions happen with where network nodes operate.',
  path: '/usage-clock',
  networks: ['mainnet'],
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
