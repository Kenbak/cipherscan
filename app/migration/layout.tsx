import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Orchard → Ironwood Migration — CipherScan',
  description:
    'Track the Orchard-to-Ironwood migration in real time: cohort waves, denomination collisions, anonymity sets, and a trustless supply audit of the NU6.3 turnstile.',
  openGraph: {
    title: 'Orchard → Ironwood Migration — CipherScan',
    description:
      'The canonical view of Zcash\u2019s NU6.3 migration \u2014 cohort waves, denomination histograms, and a trustless supply audit.',
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
