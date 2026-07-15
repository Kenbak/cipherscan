import type { Metadata } from 'next';
import { buildPageMetadata, truncateHash } from '@/lib/seo';

type Props = {
  params: Promise<{ pubkey: string }>;
  children: React.ReactNode;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { pubkey } = await params;
  const normalizedPubkey = pubkey.toLowerCase();
  const validPubkey = /^[a-f0-9]{64}$/.test(normalizedPubkey);

  return buildPageMetadata({
    title: validPubkey
      ? `Crosslink Finalizer ${truncateHash(normalizedPubkey)} | CipherScan`
      : 'Invalid Crosslink Finalizer | CipherScan',
    description: validPubkey
      ? `View Crosslink finalizer ${normalizedPubkey}, including stake, voting participation, and recent staking activity.`
      : 'This finalizer identifier is not a valid 64-character public key.',
    path: `/finalizer/${encodeURIComponent(normalizedPubkey)}`,
    index: false,
    canonical: validPubkey,
    networks: ['crosslink-testnet'],
    imageAlt: validPubkey
      ? `CipherScan Crosslink finalizer ${truncateHash(normalizedPubkey)}`
      : 'CipherScan Crosslink finalizer lookup',
  });
}

export default function FinalizerLayout({ children }: { children: React.ReactNode }) {
  return children;
}
