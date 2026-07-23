import type { Metadata } from 'next';
import { API_CONFIG } from '@/lib/api-config';
import { retainLastGoodOrBuildFallback } from '@/lib/isr-fallback';
import { buildPageMetadata, getBaseUrl } from '@/lib/seo';
import { fetchWithDeadline, isServerRenderDeadlineError } from '@/lib/server-fetch';
import ShieldedTxsClient from './ShieldedTxsClient';

const API_URL = API_CONFIG.POSTGRES_API_URL;
const PAGE_SIZE = 25;

type FlowFilter = 'all' | 'shield' | 'deshield' | 'fully_shielded';
type PoolFilter = 'all' | 'ironwood' | 'sapling' | 'orchard' | 'mixed';
type SearchParams = Record<string, string | string[] | undefined>;
type UnavailablePolicy = 'shell' | 'throw';

interface ShieldedTransactionsPageProps {
  searchParams: Promise<SearchParams>;
  unavailablePolicy?: UnavailablePolicy;
}

interface ShieldedTransactionsRequest {
  cursor: number | null;
  cursorId: number | null;
  direction: 'next' | 'prev';
  page: number;
  flow: FlowFilter;
  pool: PoolFilter;
  minZec: number;
  pageParamConsistent: boolean;
}

interface ShieldedFlow {
  id: number;
  txid: string;
  blockHeight: number;
  blockTime: number;
  flowType: string;
  amountZec: number;
  pool: string;
  addresses: string[];
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

function parseFlow(value: string | undefined): FlowFilter {
  return value === 'shield' || value === 'deshield' || value === 'fully_shielded' ? value : 'all';
}

function parsePool(value: string | undefined): PoolFilter {
  return value === 'ironwood' || value === 'sapling' || value === 'orchard' || value === 'mixed'
    ? value
    : 'all';
}

function parseMinZec(value: string | undefined): number {
  if (!value || !/^\d+(?:\.\d+)?$/.test(value)) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 21_000_000 ? parsed : 0;
}

function parseShieldedTransactionsRequest(searchParams: SearchParams): ShieldedTransactionsRequest {
  const cursor = parsePositiveInteger(firstValue(searchParams.cursor));
  const cursorId = parseNonNegativeInteger(firstValue(searchParams.cursor_id));
  const rawPage = firstValue(searchParams.page);
  const requestedPage = parsePositiveInteger(rawPage);
  const direction = cursor && firstValue(searchParams.direction) === 'prev' ? 'prev' : 'next';

  return {
    cursor,
    cursorId: cursor === null ? null : (cursorId ?? 0),
    direction,
    page: cursor ? Math.max(2, requestedPage ?? 2) : 1,
    flow: parseFlow(firstValue(searchParams.flow_type)),
    pool: parsePool(firstValue(searchParams.pool)),
    minZec: parseMinZec(firstValue(searchParams.min_zec)),
    pageParamConsistent: rawPage === undefined
      || (cursor !== null ? requestedPage !== null && requestedPage >= 2 : requestedPage === 1),
  };
}

function hasFilters(request: ShieldedTransactionsRequest): boolean {
  return request.flow !== 'all' || request.pool !== 'all' || request.minZec > 0;
}

function getArchiveCanonicalPath(request: ShieldedTransactionsRequest): string {
  const params = new URLSearchParams();
  if (request.flow !== 'all') params.set('flow_type', request.flow);
  if (request.pool !== 'all') params.set('pool', request.pool);
  if (request.minZec > 0) params.set('min_zec', String(request.minZec));
  if (request.cursor !== null) {
    params.set('cursor', String(request.cursor));
    params.set('cursor_id', String(request.cursorId ?? 0));
    params.set('direction', request.direction);
  }
  const query = params.toString();
  return query ? `/txs/shielded?${query}` : '/txs/shielded';
}

export async function generateMetadata({
  searchParams,
}: ShieldedTransactionsPageProps): Promise<Metadata> {
  const request = parseShieldedTransactionsRequest(await searchParams);
  const isStableArchive = !hasFilters(request)
    && (request.page === 1 || request.direction === 'next')
    && request.pageParamConsistent;
  const pageSuffix = request.page > 1 ? ` - Page ${request.page}` : '';

  return buildPageMetadata({
    title: `Zcash Shielded Transactions${pageSuffix} | CipherScan`,
    description: request.page > 1
      ? `Browse Zcash shielded transaction archive page ${request.page}, including shielding and unshielding flows across privacy pools.`
      : 'Browse shielded Zcash transactions and track shielding and unshielding flows across Ironwood, Orchard, and Sapling privacy pools.',
    path: isStableArchive ? getArchiveCanonicalPath(request) : '/txs/shielded',
    index: isStableArchive && request.page === 1,
    keywords: ['zcash shielded transactions', 'zcash orchard', 'zcash sapling', 'shielded ZEC', 'zcash privacy'],
  });
}

function unavailableShieldedTransactions(policy: UnavailablePolicy, error: unknown) {
  const fallback = { flows: [], pagination: null, available: false };
  return policy === 'throw'
    ? retainLastGoodOrBuildFallback(fallback, error, 'latest shielded transactions')
    : fallback;
}

async function getInitialFlows(
  request: ShieldedTransactionsRequest,
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
      next: { revalidate: 30 },
    });
  } catch (error) {
    if (!isServerRenderDeadlineError(error)) {
      console.error('Error fetching initial shielded transactions:', error);
    }
    return unavailableShieldedTransactions(unavailablePolicy, error);
  }

  if (!res.ok) {
    return unavailableShieldedTransactions(
      unavailablePolicy,
      new Error(`Latest shielded transactions API returned HTTP ${res.status}`),
    );
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch (error) {
    return unavailableShieldedTransactions(unavailablePolicy, error);
  }

  if (!json || typeof json !== 'object' || !('success' in json) || json.success !== true) {
    return unavailableShieldedTransactions(
      unavailablePolicy,
      new Error('Latest shielded transactions API reported failure'),
    );
  }
  if (!('flows' in json) || !Array.isArray(json.flows)) {
    return unavailableShieldedTransactions(
      unavailablePolicy,
      new Error('Latest shielded transactions API returned malformed data'),
    );
  }

  try {
    const all = json.flows as ShieldedFlow[];
    const reverseOffset = request.direction === 'prev' && all.length > PAGE_SIZE ? 1 : 0;
    const flows = all.slice(reverseOffset, reverseOffset + PAGE_SIZE);
    const firstFlow = flows[0] ?? null;
    const lastFlow = flows[flows.length - 1] ?? null;
    const apiPagination: Record<string, unknown> = 'pagination' in json
      && json.pagination !== null
      && typeof json.pagination === 'object'
      ? json.pagination as Record<string, unknown>
      : {};
    const total = Number(apiPagination.total) || 0;

    return {
      flows,
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
    return unavailableShieldedTransactions(unavailablePolicy, error);
  }
}

export default async function ShieldedTransactionsPage({
  searchParams,
  unavailablePolicy = 'shell',
}: ShieldedTransactionsPageProps) {
  const request = parseShieldedTransactionsRequest(await searchParams);
  const { flows, pagination, available } = await getInitialFlows(request, unavailablePolicy);
  const archiveKey = `${request.flow}:${request.pool}:${request.minZec}:${request.cursor ?? 'first'}:${request.cursorId ?? 0}:${request.direction}:${request.page}`;
  const collectionUrl = new URL(getArchiveCanonicalPath(request), `${getBaseUrl()}/`).toString();
  const uniqueTransactions = Array.from(new Map(flows.map((flow) => [flow.txid, flow])).values());
  const collectionJsonLd = request.pageParamConsistent
    && !hasFilters(request)
    && request.direction === 'next'
    && uniqueTransactions.length > 0
    ? {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        '@id': `${collectionUrl}#collection`,
        url: collectionUrl,
        name: request.page > 1
          ? `Zcash shielded transaction archive page ${request.page}`
          : 'Latest Zcash shielded transactions',
        isPartOf: { '@id': `${getBaseUrl()}/#website` },
        mainEntity: {
          '@type': 'ItemList',
          itemListElement: uniqueTransactions.map((flow, index) => ({
            '@type': 'ListItem',
            position: index + 1,
            url: `${getBaseUrl()}/tx/${flow.txid.toLowerCase()}`,
            name: `Zcash shielded transaction ${flow.txid.toLowerCase()}`,
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
      <ShieldedTxsClient
        key={archiveKey}
        initialFlows={flows}
        initialPagination={pagination}
        initialPage={request.page}
        initialFlow={request.flow}
        initialPool={request.pool}
        initialMinZec={request.minZec}
        initialCursor={request.cursor}
        initialCursorId={request.cursorId}
        initialDirection={request.direction}
        initialUnavailable={!available}
      />
    </>
  );
}
