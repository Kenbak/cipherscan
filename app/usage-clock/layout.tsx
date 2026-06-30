import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Usage Clock — CipherScan',
  description: 'When the world uses Zcash. Transaction activity by hour and day of week, correlated with sun position. On-chain data has no location — that\'s the whole point.',
  openGraph: {
    title: 'Usage Clock — CipherScan',
    description: 'When the world uses Zcash. Transaction activity by hour and day, mapped against sun position.',
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
