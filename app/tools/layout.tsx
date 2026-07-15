import { buildPageMetadata } from '@/lib/seo';

export const metadata = buildPageMetadata({
  title: 'Developer Tools | CipherScan',
  description: 'Free Zcash developer tools: decode raw transactions, broadcast signed transactions, decrypt shielded memos, and more. Built on a live Zebra node.',
  keywords: [
    'zcash developer tools',
    'zcash raw transaction',
    'zcash tx decoder',
    'zcash broadcast transaction',
    'zcash blockchain tools',
    'ZEC developer',
  ],
  path: '/tools',
});

export default function ToolsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
