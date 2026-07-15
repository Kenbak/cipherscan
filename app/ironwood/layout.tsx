import type { Metadata } from 'next';
import { buildPageMetadata, getNetwork } from '@/lib/seo';

export function generateMetadata(): Metadata {
  if (getNetwork() === 'crosslink-testnet') {
    return {
      title: 'Page Not Found | CipherScan',
      description: 'This Zcash Ironwood tracker is not available on the Crosslink deployment.',
      robots: { index: false, follow: false },
    };
  }

  return buildPageMetadata({
    title: 'Zcash Ironwood Upgrade & Migration Tracker | CipherScan',
    description:
      'Track the Zcash Ironwood (NU6.3) activation, Orchard migration, Ironwood shielded supply, and observable turnstile activity on CipherScan.',
    keywords: [
      'Zcash Ironwood',
      'Ironwood Zcash',
      'Zcash Ironwood upgrade',
      'NU6.3',
      'Ironwood migration',
      'Orchard to Ironwood',
      'Zcash migration tracker',
    ],
    path: '/ironwood',
    imageAlt: 'CipherScan Zcash Ironwood upgrade and migration tracker',
    networks: ['mainnet'],
  });
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
