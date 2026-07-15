import type { Metadata } from 'next';
import { API_CONFIG } from '@/lib/api-config';
import { buildPageMetadata, getBaseUrl } from '@/lib/seo';
import TxsClient from './TxsClient';

const API_URL = API_CONFIG.POSTGRES_API_URL;
const PAGE_SIZE = 25;

type TxType = 'all' | 'shielded' | 'transparent' | 'coinbase';
type SearchParams = Record<string, string | string[] | undefined>;

interface TransactionsPageProps {
  searchParams: Promise<SearchParams>;
}

interface TransactionsRequest {
  cursor: number | null;
  cursorIdx: number | null;
  direction: 'next' | 'prev';
  page: number;
  type: TxType;
  pageParamConsistent: boolean;
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parseNonNegativeInteger(value: string | undefined): number | null {
  if (value === undefined || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function parsePositiveInteger(value: string | undefined): number | null {
  const parsed = parseNonNegativeInteger(value);
  return parsed !== null && parsed > 0 ? parsed : null;
}

function parseTxType(value: string | undefined): TxType {
  return value === 'shielded' || value === 'transparent' || value === 'coinbase'
    ? value
    : 'all';
}

function parseTransactionsRequest(searchParams: SearchParams): TransactionsRequest {
  const cursor = parsePositiveInteger(firstValue(searchParams.cursor));
  const cursorIdx = parseNonNegativeInteger(firstValue(searchParams.cursor_idx));
  const rawPage = firstValue(searchParams.page);
  const requestedPage = parsePositiveInteger(rawPage);
  const direction = cursor && firstValue(searchParams.direction) === 'prev' ? 'prev' : 'next';

  return {
    cursor,
    cursorIdx: cursor === null ? null : (cursorIdx ?? 0),
    direction,
    page: cursor ? Math.max(2, requestedPage ?? 2) : 1,
    type: parseTxType(firstValue(searchParams.type)),
    pageParamConsistent: rawPage === undefined
      || (cursor !== null ? requestedPage !== null && requestedPage >= 2 : requestedPage === 1),
  };
}

function getArchiveCanonicalPath(request: TransactionsRequest): string {
  const params = new URLSearchParams();
  if (request.type !== 'all') params.set('type', request.type);
  if (request.cursor !== null) {
    params.set('cursor', String(request.cursor));
    params.set('cursor_idx', String(request.cursorIdx ?? 0));
    params.set('direction', request.direction);
  }
  const query = params.toString();
  return query ? `/txs?${query}` : '/txs';
}

export async function generateMetadata({ searchParams }: TransactionsPageProps): Promise<Metadata> {
  const request = parseTransactionsRequest(await searchParams);
  const isStableArchive = request.type === 'all'
    && (request.page === 1 || request.direction === 'next')
    && request.pageParamConsistent;
  const pageSuffix = request.page > 1 ? ` - Page ${request.page}` : '';

  return buildPageMetadata({
    title: `Latest Zcash Transactions${pageSuffix} | CipherScan`,
    description: request.page > 1
      ? `Browse Zcash transaction archive page ${request.page}, with transaction hashes, block heights, transaction types, sizes, and confirmation times.`
      : 'Browse the latest Zcash transactions including shielded, transparent, and coinbase transactions. Real-time transaction explorer.',
    path: isStableArchive ? getArchiveCanonicalPath(request) : '/txs',
    index: isStableArchive,
    keywords: ['zcash transactions', 'zcash transaction explorer', 'ZEC transactions', 'zcash shielded transactions', 'zcash tx'],
  });
}

async function getInitialTxs(request: TransactionsRequest) {
  try {
    const params = new URLSearchParams({
      limit: String(PAGE_SIZE + 1),
      type: request.type,
    });
    if (request.cursor !== null) {
      params.set('cursor', String(request.cursor));
      params.set('cursor_idx', String(request.cursorIdx ?? 0));
      params.set('direction', request.direction);
    }

    const res = await fetch(`${API_URL}/api/transactions/list?${params.toString()}`, {
      cache: 'no-store',
    });
    if (!res.ok) return { txs: [], pagination: null };

    const json = await res.json();
    if (!json.success) return { txs: [], pagination: null };

    const all = json.transactions || [];
    const reverseOffset = request.direction === 'prev' && all.length > PAGE_SIZE ? 1 : 0;
    const txs = all.slice(reverseOffset, reverseOffset + PAGE_SIZE);
    const firstTx = txs[0] ?? null;
    const lastTx = txs[txs.length - 1] ?? null;
    const apiPagination = json.pagination ?? {};
    const total = Number(apiPagination.total) || 0;

    return {
      txs,
      pagination: {
        ...apiPagination,
        total,
        totalPages: Math.ceil(total / PAGE_SIZE),
        hasNext: request.direction === 'prev'
          ? request.cursor !== null && txs.length > 0
          : all.length > PAGE_SIZE,
        hasPrev: request.page > 1,
        nextCursor: lastTx ? Number(lastTx.block_height) : null,
        nextCursorIdx: lastTx ? Number(lastTx.tx_index ?? 0) : null,
        prevCursor: firstTx ? Number(firstTx.block_height) : null,
        prevCursorIdx: firstTx ? Number(firstTx.tx_index ?? 0) : null,
      },
    };
  } catch (error) {
    console.error('Error fetching initial transactions:', error);
    return { txs: [], pagination: null };
  }
}

export default async function TransactionsPage({ searchParams }: TransactionsPageProps) {
  const request = parseTransactionsRequest(await searchParams);
  const { txs, pagination } = await getInitialTxs(request);
  const archiveKey = `${request.type}:${request.cursor ?? 'first'}:${request.cursorIdx ?? 0}:${request.direction}:${request.page}`;
  const collectionUrl = new URL(getArchiveCanonicalPath(request), `${getBaseUrl()}/`).toString();
  const collectionJsonLd = request.pageParamConsistent
    && request.type === 'all'
    && request.direction === 'next'
    && txs.length > 0
    ? {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        '@id': `${collectionUrl}#collection`,
        url: collectionUrl,
        name: request.page > 1
          ? `Zcash transaction archive page ${request.page}`
          : 'Latest Zcash transactions',
        isPartOf: { '@id': `${getBaseUrl()}/#website` },
        mainEntity: {
          '@type': 'ItemList',
          itemListElement: txs.map((tx: { txid: string }, index: number) => ({
            '@type': 'ListItem',
            position: index + 1,
            url: `${getBaseUrl()}/tx/${tx.txid.toLowerCase()}`,
            name: `Zcash transaction ${tx.txid.toLowerCase()}`,
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
      <TxsClient
        key={archiveKey}
        initialTxs={txs}
        initialPagination={pagination}
        initialPage={request.page}
        initialType={request.type}
        initialCursor={request.cursor}
        initialCursorIdx={request.cursorIdx}
        initialDirection={request.direction}
      />

      {/* Static page description — server-rendered for indexing */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
        <div className="border-t border-cipher-border pt-8 max-w-3xl">
          <h2 className="text-sm font-bold font-mono text-secondary mb-3 uppercase tracking-wider">
            About Zcash Transactions
          </h2>
          <div className="space-y-3 text-sm text-muted leading-relaxed">
            <p>
              Zcash supports two kinds of value transfer: transparent transactions, which work
              like Bitcoin and expose addresses and amounts on-chain, and shielded
              transactions, which use zero-knowledge proofs (Sapling and Orchard) to keep
              sender, receiver, and amount private. Many transactions mix both — shielding
              funds into a private pool or deshielding them back out.
            </p>
            <p>
              This page lists every transaction as it is mined, with type badges for
              transparent, Sapling, Orchard, and coinbase activity, plus flow indicators for
              shielding and unshielding movements. Filter by type or open any transaction to
              inspect its inputs, outputs, and shielded components.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
