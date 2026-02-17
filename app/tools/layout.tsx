import type { Metadata } from 'next';

export const metadata: Metadata = {
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
  openGraph: {
    title: 'Zcash Developer Tools | CipherScan',
    description: 'Decode, broadcast, and inspect Zcash transactions with free developer tools.',
    url: 'https://cipherscan.app/tools',
    siteName: 'CipherScan',
    type: 'website',
  },
  alternates: {
    canonical: 'https://cipherscan.app/tools',
  },
};

export default function ToolsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
