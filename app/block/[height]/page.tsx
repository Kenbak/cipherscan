import { cache } from 'react';
import { notFound } from 'next/navigation';
import { getApiUrl } from '@/lib/api-config';
import { getBaseUrl } from '@/lib/seo';
import BlockPageClient, { type BlockPageSummary } from './BlockPageClient';

interface BlockPageRecord {
  height: number | string;
  hash: string;
  timestamp?: number | string | null;
  transactionCount?: number | string | null;
  transaction_count?: number | string | null;
  transactions?: unknown[];
  size?: number | string | null;
  isOrphaned?: boolean;
}

type BlockResolution =
  | { kind: 'found'; block: BlockPageRecord }
  | { kind: 'absent' };

const BLOCK_HASH_PATTERN = /^[a-fA-F0-9]{64}$/;
const BLOCK_HEIGHT_PATTERN = /^\d+$/;

function isValidBlockIdentifier(identifier: string): boolean {
  if (BLOCK_HASH_PATTERN.test(identifier)) return true;
  if (!BLOCK_HEIGHT_PATTERN.test(identifier)) return false;

  const height = Number(identifier);
  return Number.isSafeInteger(height) && height >= 0;
}

/**
 * Resolve enough block data to render an authoritative initial response.
 *
 * A 404/410 is an authoritative absence. Network failures, upstream 5xx
 * responses, and malformed successful payloads throw so Next serves an error
 * response rather than turning a temporary index outage into a false 404.
 */
const resolveBlock = cache(async (identifier: string): Promise<BlockResolution> => {
  let response: Response;
  const normalizedIdentifier = BLOCK_HASH_PATTERN.test(identifier)
    ? identifier.toLowerCase()
    : identifier;

  try {
    response = await fetch(`${getApiUrl()}/api/block/${encodeURIComponent(normalizedIdentifier)}`, {
      next: { revalidate: 30 },
    });
  } catch (cause) {
    throw new Error(`Block index is unavailable while resolving ${identifier}`, { cause });
  }

  if (response.status === 404 || response.status === 410) {
    return { kind: 'absent' };
  }

  if (!response.ok) {
    throw new Error(`Block index returned ${response.status} while resolving ${identifier}`);
  }

  let block: BlockPageRecord;
  try {
    block = await response.json();
  } catch (cause) {
    throw new Error(`Block index returned invalid JSON while resolving ${identifier}`, { cause });
  }

  const parsedHeight = Number(block?.height);
  if (
    !block
    || typeof block.hash !== 'string'
    || !/^[a-fA-F0-9]{64}$/.test(block.hash)
    || !Number.isSafeInteger(parsedHeight)
    || parsedHeight < 0
  ) {
    throw new Error(`Block index returned an invalid block payload for ${identifier}`);
  }

  return { kind: 'found', block };
});

function blockDescription(block: BlockPageRecord, height: number, hash: string): string {
  const transactionCount = Number(
    block.transactionCount
      ?? block.transaction_count
      ?? block.transactions?.length
      ?? 0,
  );
  const count = Number.isFinite(transactionCount) ? transactionCount : 0;
  const status = block.isOrphaned === true ? 'orphaned' : 'canonical';

  return `Zcash block ${height.toLocaleString('en-US')} is ${status}, has hash ${hash}, and records ${count.toLocaleString('en-US')} transaction${count === 1 ? '' : 's'}.`;
}

export default async function BlockPage({
  params,
}: {
  params: Promise<{ height: string }>;
}) {
  const { height: identifier } = await params;

  if (!isValidBlockIdentifier(identifier)) {
    notFound();
  }

  const resolution = await resolveBlock(identifier);
  if (resolution.kind === 'absent') {
    notFound();
  }

  const block = resolution.block;
  const height = Number(block.height);
  const hash = block.hash.toLowerCase();
  const isOrphaned = block.isOrphaned === true;
  const summary: BlockPageSummary = { height, hash, isOrphaned };
  const baseUrl = getBaseUrl();
  const canonicalIdentifier = isOrphaned ? hash : String(height);
  const canonicalUrl = new URL(
    `/block/${encodeURIComponent(canonicalIdentifier)}`,
    `${baseUrl}/`,
  ).toString();
  const statusLabel = isOrphaned ? 'Orphaned' : 'Canonical';
  const name = `${statusLabel} Zcash Block #${height.toLocaleString('en-US')}`;
  const description = blockDescription(block, height, hash);
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    '@id': `${canonicalUrl}#webpage`,
    url: canonicalUrl,
    name,
    description,
    isPartOf: {
      '@type': 'WebSite',
      '@id': `${baseUrl}/#website`,
      url: `${baseUrl}/`,
      name: 'CipherScan',
    },
    mainEntity: {
      '@type': 'Thing',
      '@id': `${canonicalUrl}#block`,
      url: canonicalUrl,
      name,
      description,
      identifier: {
        '@type': 'PropertyValue',
        propertyID: 'Zcash block hash',
        value: hash,
      },
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData).replace(/</g, '\\u003c'),
        }}
      />
      <BlockPageClient
        identifier={BLOCK_HASH_PATTERN.test(identifier) ? identifier.toLowerCase() : identifier}
        initialSummary={summary}
      />
    </>
  );
}
