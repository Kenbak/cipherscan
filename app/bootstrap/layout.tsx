import { buildPageMetadata } from '@/lib/seo';

export const metadata = buildPageMetadata({
  title: 'Zebra Crosslink Bootstrap Snapshot | CipherScan',
  description: 'Download and verify a Zebra Crosslink state snapshot for faster test node recovery and branch verification.',
  path: '/bootstrap',
  index: false,
  networks: ['crosslink-testnet'],
  imageAlt: 'CipherScan Zebra Crosslink bootstrap snapshot',
});

export default function BootstrapLayout({ children }: { children: React.ReactNode }) {
  return children;
}
