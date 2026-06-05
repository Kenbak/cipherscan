import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Turnstile Tracker — Where Does Deshielded ZEC Go? | CipherScan',
  description:
    'Track what happens after ZEC leaves shielded pools. See how much stays on transparent addresses, gets reshielded, moves to exchanges, or transfers elsewhere. Updated hourly.',
  keywords: [
    'zcash turnstile',
    'zcash deshielding',
    'zcash shielded pool',
    'deshielded ZEC',
    'zcash exchange flow',
    'zcash privacy analytics',
    'ZEC turnstile tracker',
    'CipherScan',
  ],
  openGraph: {
    title: 'Turnstile Tracker — Where Does Deshielded ZEC Go?',
    description:
      'When ZEC leaves a shielded pool, where does it go? Held, reshielded, transferred, or to exchange — tracked in real time.',
    url: 'https://cipherscan.app/turnstile',
    siteName: 'CipherScan',
    images: [
      {
        url: '/og-image.png?v=2',
        width: 1200,
        height: 630,
        alt: 'CipherScan Turnstile Tracker — Zcash deshielding analytics',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Turnstile Tracker — Where Does Deshielded ZEC Go?',
    description:
      'When ZEC leaves a shielded pool, where does it go? Held, reshielded, transferred, or to exchange — tracked in real time.',
    images: ['/og-image.png?v=2'],
    creator: '@Kenbak',
  },
  alternates: {
    canonical: 'https://cipherscan.app/turnstile',
  },
};

export default function TurnstileLayout({ children }: { children: React.ReactNode }) {
  return children;
}
