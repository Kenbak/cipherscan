import type { Metadata } from 'next';
import { buildPageMetadata, getNetwork } from '@/lib/seo';

export function generateMetadata(): Metadata {
  const network = getNetwork();
  if (network !== 'mainnet') {
    return {
      title: 'Page Not Found | ZecBlock',
      description: 'The NU7 vote tracker is only available on mainnet.',
      robots: { index: false, follow: false },
    };
  }

  return buildPageMetadata({
    title: 'NU7 Coinholder Vote Results & Verification | ZecBlock',
    description:
      'See published Zcash NU7 coinholder vote results, ZEC participation by question, and instructions to independently verify the tally with your own voting-chain node.',
    keywords: [
      'Zcash NU7',
      'Zcash governance',
      'NU7 vote',
      'coinholder vote',
      'Zcash upgrade',
      'NSM issuance',
      'Sprout deprecation',
      'ZIP 218',
    ],
    path: '/governance/nu7',
    index: true,
    imageAlt: 'ZecBlock NU7 coinholder vote tracker',
    networks: ['mainnet'],
  });
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
