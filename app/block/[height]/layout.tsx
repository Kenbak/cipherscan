import type { Metadata } from 'next';
import {
  buildPageMetadata,
  formatNumber,
  getBlockResolution,
  truncateHash,
} from '@/lib/seo';

type Props = {
  params: Promise<{ height: string }>;
  children: React.ReactNode;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { height } = await params;
  const resolution = await getBlockResolution(height);

  if (resolution.state === 'absent') {
    const title = `Zcash Block ${truncateHash(height)} Not Found | CipherScan`;
    const description = `CipherScan could not find Zcash block ${truncateHash(height)}.`;

    return buildPageMetadata({
      title,
      description,
      path: `/block/${encodeURIComponent(height)}`,
      index: false,
      canonical: false,
      imageAlt: title,
    });
  }

  const block = resolution.block;
  const blockHeight = Number(block.height);
  const timestamp = Number(block.timestamp);
  const rawTransactionCount = Number(
    block.transactionCount
      ?? block.transaction_count
      ?? block.transactions?.length
      ?? 0,
  );
  const transactionCount = Number.isFinite(rawTransactionCount) ? rawTransactionCount : 0;
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

  return buildPageMetadata({
    title,
    description,
    path: `/block/${encodeURIComponent(canonicalIdentifier)}`,
    index: true,
    imageAlt: title,
  });
}

export default function BlockLayout({ children }: { children: React.ReactNode }) {
  return children;
}
