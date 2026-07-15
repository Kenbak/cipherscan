import { buildPageMetadata } from '@/lib/seo';

export const metadata = buildPageMetadata({
  title: 'Rich List — Top Zcash Addresses by Balance | CipherScan',
  description: 'Explore the top Zcash transparent addresses ranked by balance. See labeled exchanges, mining pools, and supply concentration stats.',
  keywords: ['zcash rich list', 'zcash top addresses', 'zcash whales', 'ZEC balance', 'zcash exchanges', 'zcash supply distribution'],
  path: '/rich-list',
  networks: ['mainnet'],
});

export default function RichListLayout({ children }: { children: React.ReactNode }) {
  return children;
}
