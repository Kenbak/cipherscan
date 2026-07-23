import type { Metadata } from 'next';
import {
  buildPageMetadata,
  formatNumber,
  getApiUrl,
  getBlockResolution,
  truncateHash,
} from '@/lib/seo';
import { fetchWithDeadline } from '@/lib/server-fetch';
import { retainLastGoodOrBuildFallback } from '@/lib/isr-fallback';

type Props = {
  params: Promise<{ height: string }>;
  children: React.ReactNode;
};

export const revalidate = 30;

export function generateStaticParams(): Array<{ height: string }> {
  return [];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { height } = await params;
  const resolution = await getBlockResolution(height);

  if (resolution.state === 'absent') {
    // Check if this is a future block (valid height above tip)
    if (/^\d+$/.test(height)) {
      const res = await fetchWithDeadline(`${getApiUrl()}/api/info`, { next: { revalidate: 30 } });
      if (!res.ok) throw new Error(`Chain tip returned HTTP ${res.status}`);

      const data = await res.json();
      const rawHeight = data.height ?? data.blocks;
      const tipHeight = rawHeight === null || rawHeight === undefined || rawHeight === ''
        ? Number.NaN
        : Number(rawHeight);
      if (!Number.isSafeInteger(tipHeight) || tipHeight < 0) {
        throw new Error('Chain tip payload is malformed');
      }
      if (Number(height) > tipHeight) {
        const title = `Zcash Block #${formatNumber(Number(height))} — Estimated Arrival | CipherScan`;
        const description = `Zcash block #${formatNumber(Number(height))} has not been mined yet. Estimated to arrive in approximately ${formatNumber(Number(height) - tipHeight)} blocks (~${Math.round((Number(height) - tipHeight) * 75 / 3600)} hours).`;
        return buildPageMetadata({
          title,
          description,
          path: `/block/${height}`,
          index: false,
          canonical: false,
          imageAlt: title,
        });
      }
    }

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

  if (resolution.state === 'unavailable') {
    const title = `Zcash Block ${truncateHash(height)} Status Unknown | CipherScan`;
    const fallback = buildPageMetadata({
      title,
      description: `CipherScan cannot currently verify Zcash block ${truncateHash(height)} because the block index is temporarily unavailable.`,
      path: `/block/${encodeURIComponent(height)}`,
      index: false,
      imageAlt: title,
    });
    return retainLastGoodOrBuildFallback(
      fallback,
      new Error(`Block ${height} metadata is unavailable`),
      'block detail metadata',
    );
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
