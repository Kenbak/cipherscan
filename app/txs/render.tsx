import { API_CONFIG } from '@/lib/api-config';
import { retainLastGoodOrBuildFallback } from '@/lib/isr-fallback';
import { buildPageMetadata, getBaseUrl } from '@/lib/seo';
import { fetchWithDeadline, isServerRenderDeadlineError } from '@/lib/server-fetch';
import TxsClient from './TxsClient';

const API_URL = API_CONFIG.POSTGRES_API_URL;
const PAGE_SIZE = 25;

export type TxType = 'all' | 'shielded' | 'transparent' | 'coinbase';
export type FlowFilter = 'all' | 'shield' | 'deshield' | 'fully_shielded';
export type PoolFilter = 'all' | 'ironwood' | 'sapling' | 'orchard' | 'mixed';
export type SearchParams = Record<string, string | string[] | undefined>;
export type UnavailablePolicy = 'shell' | 'throw';

export interface TransactionsRequest {
  cursor: number | null;
  cursorIdx: number | null;
  cursorId: number | null;
  direction: 'next' | 'prev';
  page: number;
  type: TxType;
  flow: FlowFilter;
  pool: PoolFilter;
  minZec: number;
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

function parseFlow(value: string | undefined): FlowFilter {
  return value === 'shield' || value === 'deshield' || value === 'fully_shielded' ? value : 'all';
}

function parsePool(value: string | undefined): PoolFilter {
  return value === 'ironwood' || value === 'sapling' || value === 'orchard' || value === 'mixed'
    ? value : 'all';
}

function parseMinZec(value: string | undefined): number {
  if (!value || !/^\d+(?:\.\d+)?$/.test(value)) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 21_000_000 ? parsed : 0;
}

export function parseTransactionsRequest(searchParams: SearchParams): TransactionsRequest {
  const type = parseTxType(firstValue(searchParams.type));
  const cursor = parsePositiveInteger(firstValue(searchParams.cursor));
  const cursorIdx = parseNonNegativeInteger(firstValue(searchParams.cursor_idx));
  const cursorId = parseNonNegativeInteger(firstValue(searchParams.cursor_id));
  const rawPage = firstValue(searchParams.page);
  const requestedPage = parsePositiveInteger(rawPage);
  const direction = cursor && firstValue(searchParams.direction) === 'prev' ? 'prev' : 'next';

  return {
    cursor,
    cursorIdx: cursor === null ? null : (cursorIdx ?? 0),
    cursorId: cursor === null ? null : (cursorId ?? 0),
    direction,
    page: cursor ? Math.max(2, requestedPage ?? 2) : 1,
    type,
    flow: type === 'shielded' ? parseFlow(firstValue(searchParams.flow_type)) : 'all',
    pool: type === 'shielded' ? parsePool(firstValue(searchParams.pool)) : 'all',
    minZec: type === 'shielded' ? parseMinZec(firstValue(searchParams.min_zec)) : 0,
    pageParamConsistent: rawPage === undefined
      || (cursor !== null ? requestedPage !== null && requestedPage >= 2 : requestedPage === 1),
  };
}

export function getArchiveCanonicalPath(request: TransactionsRequest): string {
  const params = new URLSearchParams();
  if (request.type !== 'all') params.set('type', request.type);
  if (request.type === 'shielded') {
    if (request.flow !== 'all') params.set('flow_type', request.flow);
    if (request.pool !== 'all') params.set('pool', request.pool);
    if (request.minZec > 0) params.set('min_zec', String(request.minZec));
  }
  if (request.cursor !== null) {
    params.set('cursor', String(request.cursor));
    if (request.type === 'shielded') {
      params.set('cursor_id', String(request.cursorId ?? 0));
    } else {
      params.set('cursor_idx', String(request.cursorIdx ?? 0));
    }
    params.set('direction', request.direction);
  }
  const query = params.toString();
  return query ? `/txs?${query}` : '/txs';
}

export function hasShieldedSubFilters(request: TransactionsRequest): boolean {
  return request.flow !== 'all' || request.pool !== 'all' || request.minZec > 0;
}

function unavailableData(policy: UnavailablePolicy, error: unknown, label: string) {
  const fallback = { items: [], pagination: null, available: false };
  return policy === 'throw'
    ? retainLastGoodOrBuildFallback(fallback, error, label)
    : fallback;
}

async function getInitialTxs(
  request: TransactionsRequest,
  unavailablePolicy: UnavailablePolicy,
) {
  let res: Response;
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

    res = await fetchWithDeadline(`${API_URL}/api/transactions/list?${params.toString()}`, {
      next: { revalidate: 30, tags: ['chain-tip'] },
    });
  } catch (error) {
    if (!isServerRenderDeadlineError(error)) {
      console.error('Error fetching initial transactions:', error);
    }
    return unavailableData(unavailablePolicy, error, 'latest transactions');
  }

  if (!res.ok) {
    return unavailableData(unavailablePolicy, new Error(`API returned HTTP ${res.status}`), 'latest transactions');
  }

  let json: unknown;
  try { json = await res.json(); } catch (error) {
    return unavailableData(unavailablePolicy, error, 'latest transactions');
  }

  if (!json || typeof json !== 'object' || !('success' in json) || json.success !== true) {
    return unavailableData(unavailablePolicy, new Error('API reported failure'), 'latest transactions');
  }
  if (!('transactions' in json) || !Array.isArray(json.transactions)) {
    return unavailableData(unavailablePolicy, new Error('Malformed response'), 'latest transactions');
  }

  try {
    const all = json.transactions;
    const reverseOffset = request.direction === 'prev' && all.length > PAGE_SIZE ? 1 : 0;
    const txs = all.slice(reverseOffset, reverseOffset + PAGE_SIZE);
    const firstTx = txs[0] ?? null;
    const lastTx = txs[txs.length - 1] ?? null;
    const apiPagination: Record<string, unknown> = 'pagination' in json
      && json.pagination !== null && typeof json.pagination === 'object'
      ? json.pagination as Record<string, unknown> : {};
    const total = Number(apiPagination.total) || 0;

    return {
      items: txs,
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
      available: true,
    };
  } catch (error) {
    return unavailableData(unavailablePolicy, error, 'latest transactions');
  }
}

async function getInitialFlows(
  request: TransactionsRequest,
  unavailablePolicy: UnavailablePolicy,
) {
  let res: Response;
  try {
    const params = new URLSearchParams({
      limit: String(PAGE_SIZE + 1),
      flow_type: request.flow,
      pool: request.pool,
    });
    if (request.minZec > 0) params.set('min_zec', String(request.minZec));
    if (request.cursor !== null) {
      params.set('cursor', String(request.cursor));
      params.set('cursor_id', String(request.cursorId ?? 0));
      params.set('direction', request.direction);
    }

    res = await fetchWithDeadline(`${API_URL}/api/shielded/list?${params.toString()}`, {
      next: { revalidate: 30, tags: ['chain-tip'] },
    }, 5_000);
  } catch (error) {
    if (!isServerRenderDeadlineError(error)) {
      console.error('Error fetching initial shielded flows:', error);
    }
    return unavailableData(unavailablePolicy, error, 'latest shielded transactions');
  }

  if (!res.ok) {
    return unavailableData(unavailablePolicy, new Error(`API returned HTTP ${res.status}`), 'latest shielded transactions');
  }

  let json: unknown;
  try { json = await res.json(); } catch (error) {
    return unavailableData(unavailablePolicy, error, 'latest shielded transactions');
  }

  if (!json || typeof json !== 'object' || !('success' in json) || json.success !== true) {
    return unavailableData(unavailablePolicy, new Error('API reported failure'), 'latest shielded transactions');
  }
  if (!('flows' in json) || !Array.isArray(json.flows)) {
    return unavailableData(unavailablePolicy, new Error('Malformed response'), 'latest shielded transactions');
  }

  try {
    const all = json.flows;
    const reverseOffset = request.direction === 'prev' && all.length > PAGE_SIZE ? 1 : 0;
    const flows = all.slice(reverseOffset, reverseOffset + PAGE_SIZE);
    const firstFlow = flows[0] ?? null;
    const lastFlow = flows[flows.length - 1] ?? null;
    const apiPagination: Record<string, unknown> = 'pagination' in json
      && json.pagination !== null && typeof json.pagination === 'object'
      ? json.pagination as Record<string, unknown> : {};
    const total = Number(apiPagination.total) || 0;

    return {
      items: flows,
      pagination: {
        ...apiPagination,
        total,
        totalPages: Math.ceil(total / PAGE_SIZE),
        hasNext: request.direction === 'prev'
          ? request.cursor !== null && flows.length > 0
          : all.length > PAGE_SIZE,
        hasPrev: request.page > 1,
        nextCursor: lastFlow ? Number(lastFlow.blockTime) : null,
        nextCursorId: lastFlow ? Number(lastFlow.id) : null,
        prevCursor: firstFlow ? Number(firstFlow.blockTime) : null,
        prevCursorId: firstFlow ? Number(firstFlow.id) : null,
      },
      available: true,
    };
  } catch (error) {
    return unavailableData(unavailablePolicy, error, 'latest shielded transactions');
  }
}

export async function renderTransactionsPage(
  searchParams: Promise<SearchParams>,
  unavailablePolicy: UnavailablePolicy = 'shell',
) {
  const request = parseTransactionsRequest(await searchParams);
  const isShielded = request.type === 'shielded';

  let initialTxs: unknown[] = [];
  let initialFlows: unknown[] = [];
  let pagination: Record<string, unknown> | null = null;
  let available = true;

  if (isShielded) {
    const result = await getInitialFlows(request, unavailablePolicy);
    initialFlows = result.items;
    pagination = result.pagination;
    available = result.available;
  } else {
    const result = await getInitialTxs(request, unavailablePolicy);
    initialTxs = result.items;
    pagination = result.pagination;
    available = result.available;
  }

  const archiveKey = `${request.type}:${request.flow}:${request.pool}:${request.minZec}:${request.cursor ?? 'first'}:${request.cursorIdx ?? 0}:${request.cursorId ?? 0}:${request.direction}:${request.page}`;
  const collectionUrl = new URL(getArchiveCanonicalPath(request), `${getBaseUrl()}/`).toString();
  const items = isShielded ? initialFlows : initialTxs;
  const uniqueItems = isShielded
    ? Array.from(new Map((items as { txid: string }[]).map(f => [f.txid, f])).values())
    : items as { txid: string }[];

  const collectionJsonLd = request.pageParamConsistent
    && (request.type === 'all' || (request.type === 'shielded' && !hasShieldedSubFilters(request)))
    && request.direction === 'next'
    && uniqueItems.length > 0
    ? {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        '@id': `${collectionUrl}#collection`,
        url: collectionUrl,
        name: request.page > 1
          ? `Zcash ${isShielded ? 'shielded ' : ''}transaction archive page ${request.page}`
          : `Latest Zcash ${isShielded ? 'shielded ' : ''}transactions`,
        isPartOf: { '@id': `${getBaseUrl()}/#website` },
        mainEntity: {
          '@type': 'ItemList',
          itemListElement: uniqueItems.map((item, index) => ({
            '@type': 'ListItem',
            position: index + 1,
            url: `${getBaseUrl()}/tx/${item.txid.toLowerCase()}`,
            name: `Zcash ${isShielded ? 'shielded ' : ''}transaction ${item.txid.toLowerCase()}`,
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
        initialTxs={initialTxs as never[]}
        initialFlows={initialFlows as never[]}
        initialPagination={pagination}
        initialPage={request.page}
        initialType={request.type}
        initialFlowFilter={request.flow}
        initialPoolFilter={request.pool}
        initialMinZec={request.minZec}
        initialCursor={request.cursor}
        initialCursorIdx={request.cursorIdx}
        initialCursorId={request.cursorId}
        initialDirection={request.direction}
        initialUnavailable={!available}
      />

      {/* Static SEO content — server-rendered for indexing */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
        <div className="border-t border-cipher-border pt-8 max-w-3xl">
          <h2 className="text-sm font-bold font-mono text-secondary mb-3 uppercase tracking-wider">
            About Zcash Transactions
          </h2>
          <div className="space-y-3 text-sm text-muted leading-relaxed">
            <p>
              Zcash supports two kinds of value transfer: transparent transactions, which work
              like Bitcoin and expose addresses and amounts on-chain, and shielded
              transactions, which use zero-knowledge proofs (Sapling, Orchard, and Ironwood) to keep
              sender, receiver, and amount private. Many transactions mix both — shielding
              funds into a private pool or deshielding them back out.
            </p>
            <p>
              This page lists every transaction as it is mined, with type badges for
              transparent, Sapling, Orchard, Ironwood, and coinbase activity, plus flow indicators for
              shielding and unshielding movements. Filter by type, pool, flow direction, or
              minimum amount to analyze specific transaction patterns.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
