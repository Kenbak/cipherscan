import type { Metadata } from 'next';
import { getAddressMeta, getBaseUrl, formatNumber } from '@/lib/seo';

type Props = {
  params: Promise<{ address: string }>;
  children: React.ReactNode;
};

function getAddressTypeLabel(addr: string, type: string): string {
  if (addr.startsWith('u1') || addr.startsWith('utest')) return 'Unified';
  if (addr.startsWith('zs') || addr.startsWith('ztestsapling')) return 'Sapling Shielded';
  if (type === 'shielded') return 'Shielded';
  return 'Transparent';
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { address } = await params;
  const meta = await getAddressMeta(address);
  const baseUrl = getBaseUrl();

  const shortAddr = address.length > 20
    ? `${address.slice(0, 10)}...${address.slice(-8)}`
    : address;

  if (!meta) {
    return {
      title: `Address ${shortAddr} | CipherScan`,
      description: `View Zcash address ${shortAddr} on CipherScan — the Zcash blockchain explorer.`,
    };
  }

  const typeLabel = getAddressTypeLabel(address, meta.type);
  const title = `${typeLabel} Address ${shortAddr} | CipherScan — Zcash Explorer`;

  const descParts = [`${typeLabel} Zcash address.`];
  if (!meta.isShielded) {
    descParts.push(`Balance: ${meta.balance.toFixed(4)} ZEC.`);
    if (meta.txCount > 0) {
      descParts.push(`${formatNumber(meta.txCount)} transaction${meta.txCount !== 1 ? 's' : ''}.`);
    }
  } else {
    descParts.push('Balance and transaction history are encrypted with zero-knowledge proofs.');
  }
  descParts.push('View on CipherScan.');

  const description = descParts.join(' ');

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `${baseUrl}/address/${address}`,
      siteName: 'CipherScan',
      type: 'website',
    },
    twitter: {
      card: 'summary',
      title,
      description,
    },
    alternates: {
      canonical: `${baseUrl}/address/${address}`,
    },
  };
}

export default function AddressLayout({ children }: { children: React.ReactNode }) {
  return children;
}
