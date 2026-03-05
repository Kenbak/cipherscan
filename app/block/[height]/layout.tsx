import type { Metadata } from 'next';
import { getBlockMeta, getBaseUrl, formatNumber, truncateHash } from '@/lib/seo';

type Props = {
  params: Promise<{ height: string }>;
  children: React.ReactNode;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { height } = await params;
  const block = await getBlockMeta(height);
  const baseUrl = getBaseUrl();

  if (!block) {
    return {
      title: `Block #${height} | CipherScan`,
      description: `View Zcash block #${height} on CipherScan — the Zcash blockchain explorer.`,
    };
  }

  const date = new Date(block.timestamp * 1000);
  const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const title = `Block #${formatNumber(block.height)} | CipherScan — Zcash Explorer`;
  const description = `Zcash block #${formatNumber(block.height)} mined on ${dateStr}. Contains ${formatNumber(block.transactionCount)} transaction${block.transactionCount !== 1 ? 's' : ''}, size ${(block.size / 1024).toFixed(1)} KB. Hash: ${truncateHash(block.hash)}.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `${baseUrl}/block/${height}`,
      siteName: 'CipherScan',
      type: 'website',
    },
    twitter: {
      card: 'summary',
      title,
      description,
    },
    alternates: {
      canonical: `${baseUrl}/block/${height}`,
    },
  };
}

export default function BlockLayout({ children }: { children: React.ReactNode }) {
  return children;
}
