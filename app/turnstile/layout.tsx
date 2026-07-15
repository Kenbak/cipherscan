import { buildPageMetadata } from '@/lib/seo';

export const metadata = buildPageMetadata({
  title: 'Zcash Turnstile Tracker | CipherScan',
  description:
    'Track where deshielded ZEC goes: transparent addresses, reshielding, exchanges, and other transfers. Updated hourly.',
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
  path: '/turnstile',
  imageAlt: 'CipherScan Turnstile Tracker — Zcash deshielding analytics',
  networks: ['mainnet'],
});

export default function TurnstileLayout({ children }: { children: React.ReactNode }) {
  return children;
}
