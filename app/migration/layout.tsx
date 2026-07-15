import { buildPageMetadata } from '@/lib/seo';

export const metadata = buildPageMetadata({
  title: 'Orchard to Ironwood Migration | CipherScan',
  description:
    'Track the Orchard-to-Ironwood migration: cohort waves, denomination collisions, anonymity sets, and the trustless NU6.3 turnstile supply audit.',
  path: '/migration',
  networks: ['mainnet'],
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
