import type { Metadata } from 'next';
import { cache } from 'react';
import { getApiUrl } from '@/lib/api-config';
import { getBaseUrl, getNetwork, formatNumber, truncateHash } from '@/lib/seo';

interface BlockMetadataData {
  height: number | string;
  hash: string;
  timestamp?: number | string | null;
  transactionCount?: number;
  transaction_count?: number;
  transactions?: unknown[];
  size?: number | string | null;
  isOrphaned?: boolean;
  canonicalBlock?: {
    hash?: string | null;
  } | null;
}

const getBlockMetadata = cache(async (identifier: string): Promise<BlockMetadataData | null> => {
  try {
    const normalizedIdentifier = /^[a-fA-F0-9]{64}$/.test(identifier)
      ? identifier.toLowerCase()
      : identifier;
    const response = await fetch(`${getApiUrl()}/api/block/${encodeURIComponent(normalizedIdentifier)}`, {
      next: { revalidate: 30 },
    });

    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
});

type Props = {
  params: Promise<{ height: string }>;
  children: React.ReactNode;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { height } = await params;
  const block = await getBlockMetadata(height);
  const baseUrl = getBaseUrl();
  const imageUrl = new URL('/og-image.png?v=2', `${baseUrl}/`).toString();
  const shouldIndex = getNetwork() === 'mainnet';

  if (!block) {
    const title = `Zcash Block ${truncateHash(height)} Not Found | CipherScan`;
    const description = `CipherScan could not find Zcash block ${truncateHash(height)}.`;

    return {
      metadataBase: new URL(baseUrl),
      title,
      description,
      robots: {
        index: false,
        follow: true,
        googleBot: {
          index: false,
          follow: true,
          'max-image-preview': 'large',
          'max-snippet': -1,
        },
      },
      alternates: { canonical: null },
      openGraph: {
        title,
        description,
        url: `${baseUrl}/block/${encodeURIComponent(height)}`,
        siteName: 'CipherScan',
        locale: 'en_US',
        type: 'website',
        images: [{
          url: imageUrl,
          width: 1051,
          height: 520,
          alt: title,
        }],
      },
      twitter: {
        card: 'summary_large_image',
        title,
        description,
        images: [imageUrl],
        creator: '@Kenbak',
      },
    };
  }

  const blockHeight = Number(block.height);
  const timestamp = Number(block.timestamp);
  const transactionCount = block.transactionCount
    ?? block.transaction_count
    ?? block.transactions?.length
    ?? 0;
  const size = Number(block.size ?? 0);
  const blockLabel = Number.isFinite(blockHeight)
    ? formatNumber(blockHeight)
    : String(block.height);
  const canonicalHash = block.hash.toLowerCase();
  const isOrphaned = block.isOrphaned === true;
  const canonicalIdentifier = isOrphaned
    ? canonicalHash
    : Number.isSafeInteger(blockHeight) && blockHeight >= 0
      ? String(blockHeight)
      : String(block.height);
  const canonicalUrl = `${baseUrl}/block/${encodeURIComponent(canonicalIdentifier)}`;
  const replacementHash = block.canonicalBlock?.hash?.toLowerCase();

  const title = isOrphaned
    ? `Orphaned Zcash Block #${blockLabel} | CipherScan`
    : `Zcash Block #${blockLabel} | CipherScan`;

  let description: string;
  if (isOrphaned) {
    const replacement = replacementHash
      ? ` Canonical replacement: ${truncateHash(replacementHash)}.`
      : '';
    description = `Orphaned Zcash block #${blockLabel} recorded ${formatNumber(transactionCount)} transaction${transactionCount !== 1 ? 's' : ''} before it was replaced in a chain reorganization. Hash: ${truncateHash(canonicalHash)}.${replacement}`;
  } else {
    const validTimestamp = Number.isFinite(timestamp) && timestamp > 0;
    const datePart = validTimestamp
      ? ` mined on ${new Date(timestamp * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
      : '';
    const sizePart = Number.isFinite(size) && size > 0
      ? `, size ${(size / 1024).toFixed(1)} KB`
      : '';
    description = `Zcash block #${blockLabel}${datePart}. Contains ${formatNumber(transactionCount)} transaction${transactionCount !== 1 ? 's' : ''}${sizePart}. Hash: ${truncateHash(canonicalHash)}.`;
  }

  return {
    metadataBase: new URL(baseUrl),
    title,
    description,
    robots: {
      index: shouldIndex,
      follow: true,
      googleBot: {
        index: shouldIndex,
        follow: true,
        'max-image-preview': 'large',
        'max-snippet': -1,
      },
    },
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      siteName: 'CipherScan',
      locale: 'en_US',
      type: 'website',
      images: [{
        url: imageUrl,
        width: 1051,
        height: 520,
        alt: title,
      }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [imageUrl],
      creator: '@Kenbak',
    },
    alternates: {
      canonical: canonicalUrl,
    },
  };
}

export default function BlockLayout({ children }: { children: React.ReactNode }) {
  return children;
}
