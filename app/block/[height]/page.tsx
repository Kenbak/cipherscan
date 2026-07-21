import { notFound } from 'next/navigation';
import {
  getBaseUrl,
  getApiUrl,
  getBlockResolution,
  normalizeBlockIdentifier,
  type BlockRecord,
} from '@/lib/seo';
import { fetchWithDeadline } from '@/lib/server-fetch';
import BlockPageClient, { type BlockPageSummary } from './BlockPageClient';
import { FutureBlockView } from './FutureBlockView';

function blockDescription(block: BlockRecord, height: number, hash: string): string {
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

async function getCurrentTipHeight(): Promise<number | null> {
  try {
    const res = await fetchWithDeadline(`${getApiUrl()}/api/info`, {
      next: { revalidate: 30 },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.height ?? data.blocks ?? null;
  } catch {
    return null;
  }
}

export default async function BlockPage({
  params,
}: {
  params: Promise<{ height: string }>;
}) {
  const { height: identifier } = await params;
  const resolution = await getBlockResolution(identifier);
  if (resolution.state === 'absent') {
    const requestedHeight = /^\d+$/.test(identifier) ? Number(identifier) : null;
    if (requestedHeight !== null && requestedHeight >= 0) {
      const tipHeight = await getCurrentTipHeight();
      if (tipHeight !== null && requestedHeight > tipHeight) {
        return <FutureBlockView targetHeight={requestedHeight} currentHeight={tipHeight} />;
      }
    }
    notFound();
  }

  if (resolution.state === 'unavailable') {
    return (
      <BlockPageClient
        identifier={normalizeBlockIdentifier(identifier)}
        initialSummary={null}
      />
    );
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
        identifier={normalizeBlockIdentifier(identifier)}
        initialSummary={summary}
      />
    </>
  );
}
