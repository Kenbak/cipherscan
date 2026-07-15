import { buildPageMetadata } from '@/lib/seo';

export const metadata = buildPageMetadata({
  title: 'Wallet Anonymity Analysis | CipherScan',
  description:
    'Analyze Zcash wallet fingerprints, fee lane anonymity sets, and estimated wallet usage. See how transaction fees, expiry heights, and action padding reveal wallet identity.',
  path: '/privacy/wallets',
  networks: ['mainnet'],
  keywords: [
    'zcash wallet fingerprint',
    'zcash anonymity set',
    'zip-317 fee lanes',
    'zcash privacy analysis',
    'wallet usage distribution',
  ],
});

export default function WalletsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
