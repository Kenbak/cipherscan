import type { Metadata } from 'next';
import { API_CONFIG } from '@/lib/api-config';
import { buildPageMetadata, getBaseUrl } from '@/lib/seo';
import BlocksClient from './BlocksClient';

const API_URL = API_CONFIG.POSTGRES_API_URL;
const PAGE_SIZE = 25;

type SearchParams = Record<string, string | string[] | undefined>;

interface BlocksPageProps {
  searchParams: Promise<SearchParams>;
}

interface BlocksRequest {
  cursor: number | null;
  direction: 'next' | 'prev';
  page: number;
  pageParamConsistent: boolean;
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parsePositiveInteger(value: string | undefined): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseBlocksRequest(searchParams: SearchParams): BlocksRequest {
  const cursor = parsePositiveInteger(firstValue(searchParams.cursor));
  const rawPage = firstValue(searchParams.page);
  const requestedPage = parsePositiveInteger(rawPage);
  const direction = cursor && firstValue(searchParams.direction) === 'prev' ? 'prev' : 'next';

  return {
    cursor,
    direction,
    page: cursor ? Math.max(2, requestedPage ?? 2) : 1,
    // `page` is only a UI label; the cursor identifies the result slice. Keep
    // malformed combinations out of the index while canonicalizing valid
    // navigation URLs to their cursor identity below.
    pageParamConsistent: rawPage === undefined
      || (cursor !== null ? requestedPage !== null && requestedPage >= 2 : requestedPage === 1),
  };
}

function getArchiveCanonicalPath(request: BlocksRequest): string {
  if (!request.cursor) return '/blocks';
  const params = new URLSearchParams({
    cursor: String(request.cursor),
    direction: request.direction,
  });
  return `/blocks?${params.toString()}`;
}

export async function generateMetadata({ searchParams }: BlocksPageProps): Promise<Metadata> {
  const request = parseBlocksRequest(await searchParams);
  const isForwardArchive = (request.page === 1 || request.direction === 'next')
    && request.pageParamConsistent;
  const pageSuffix = request.page > 1 ? ` - Page ${request.page}` : '';

  return buildPageMetadata({
    title: `Latest Zcash Blocks${pageSuffix} | CipherScan`,
    description: request.page > 1
      ? `Browse Zcash block archive page ${request.page}, including block heights, hashes, transaction counts, sizes, miners, and timestamps.`
      : 'Browse the latest Zcash blocks with transaction counts, sizes, mining rewards, and timestamps. Real-time block explorer data.',
    path: isForwardArchive ? getArchiveCanonicalPath(request) : '/blocks',
    index: isForwardArchive,
    keywords: ['zcash blocks', 'zcash block explorer', 'zcash latest blocks', 'ZEC blocks', 'zcash block height'],
  });
}

async function getInitialBlocks(request: BlocksRequest) {
  try {
    const params = new URLSearchParams({ limit: String(PAGE_SIZE + 1) });
    if (request.cursor !== null) {
      params.set('cursor', String(request.cursor));
      params.set('direction', request.direction);
    }

    const res = await fetch(`${API_URL}/api/blocks/list?${params.toString()}`, {
      next: { revalidate: 30 },
    });
    if (!res.ok) {
      return { blocks: [], trailingBlock: null, pagination: null, available: false };
    }

    const json = await res.json();
    if (!json.success) {
      return { blocks: [], trailingBlock: null, pagination: null, available: false };
    }

    const all = json.blocks || [];
    // A reverse query returns one boundary row from the preceding page when
    // using PAGE_SIZE + 1. Drop that lookahead so Prev reconstructs the same
    // 25-row slice that the forward crawl path produced.
    const reverseOffset = request.direction === 'prev' && all.length > PAGE_SIZE ? 1 : 0;
    const blocks = all.slice(reverseOffset, reverseOffset + PAGE_SIZE);
    const firstBlock = blocks[0] ?? null;
    const lastBlock = blocks[blocks.length - 1] ?? null;
    const apiPagination = json.pagination ?? {};
    const total = Number(apiPagination.total) || 0;

    return {
      blocks,
      trailingBlock: request.direction === 'next' && all.length > PAGE_SIZE
        ? all[PAGE_SIZE]
        : null,
      pagination: {
        ...apiPagination,
        page: request.page,
        total,
        totalPages: Math.ceil(total / PAGE_SIZE),
        hasNext: request.direction === 'prev'
          ? request.cursor !== null && blocks.length > 0
          : all.length > PAGE_SIZE,
        hasPrev: request.page > 1,
        nextCursor: lastBlock ? Number(lastBlock.height) : null,
        prevCursor: firstBlock ? Number(firstBlock.height) : null,
      },
      available: true,
    };
  } catch (error) {
    console.error('Error fetching initial blocks:', error);
    return { blocks: [], trailingBlock: null, pagination: null, available: false };
  }
}

export default async function BlocksPage({ searchParams }: BlocksPageProps) {
  const request = parseBlocksRequest(await searchParams);
  const { blocks, trailingBlock, pagination, available } = await getInitialBlocks(request);
  const archiveKey = `${request.cursor ?? 'first'}:${request.direction}:${request.page}`;
  const collectionUrl = new URL(getArchiveCanonicalPath(request), `${getBaseUrl()}/`).toString();
  const collectionJsonLd = request.pageParamConsistent
    && request.direction === 'next'
    && blocks.length > 0
    ? {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        '@id': `${collectionUrl}#collection`,
        url: collectionUrl,
        name: request.page > 1 ? `Zcash block archive page ${request.page}` : 'Latest Zcash blocks',
        isPartOf: { '@id': `${getBaseUrl()}/#website` },
        mainEntity: {
          '@type': 'ItemList',
          itemListElement: blocks.map((block: { height: number | string }, index: number) => ({
            '@type': 'ListItem',
            position: index + 1,
            url: `${getBaseUrl()}/block/${Number(block.height)}`,
            name: `Zcash block #${Number(block.height).toLocaleString('en-US')}`,
          })),
        },
      }
    : null;

  return (
    <>
      {collectionJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionJsonLd).replace(/</g, '\\u003c') }}
        />
      )}
      <BlocksClient
        key={archiveKey}
        initialBlocks={blocks}
        initialTrailingBlock={trailingBlock}
        initialPagination={pagination}
        initialCursor={request.cursor}
        initialDirection={request.direction}
        initialPage={request.page}
        initialUnavailable={!available}
      />

      {/* Static page description — server-rendered for indexing */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
        <div className="border-t border-cipher-border pt-8 max-w-3xl">
          <h2 className="text-sm font-bold font-mono text-secondary mb-3 uppercase tracking-wider">
            About Zcash Blocks
          </h2>
          <div className="space-y-3 text-sm text-muted leading-relaxed">
            <p>
              Zcash produces a new block roughly every 75 seconds. Each block bundles
              transparent and shielded transactions, a coinbase reward for the miner, and a
              commitment to the current state of the shielded pools. CipherScan indexes every
              block directly from a Zebra full node, so heights, hashes, sizes, and intervals
              on this page reflect the canonical chain in real time.
            </p>
            <p>
              The interval column tracks the spacing between consecutive blocks — useful for
              spotting hashrate swings or unusually slow blocks. Click any height or hash to
              inspect the full block: its transactions, miner, difficulty, and shielded
              activity.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
