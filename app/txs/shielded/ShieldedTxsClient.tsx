'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { formatRelativeTime } from '@/lib/utils';
import { usePostgresApiClient, getApiUrl } from '@/lib/api-config';
import { Pagination } from '@/components/Pagination';
import { ShieldFlowBadge, ShieldFlowLegend } from '@/components/ShieldFlowBadge';
import { resolveShieldFlowType } from '@/components/icons/shield-flow';
import { Badge, PageHeader, DataTable, HashLink, type DataTableColumn } from '@/components/ui';

type FlowFilter = 'all' | 'shield' | 'deshield' | 'fully_shielded';
type PoolFilter = 'all' | 'ironwood' | 'sapling' | 'orchard' | 'mixed';

interface ShieldedFlow {
  id: number;
  txid: string;
  blockHeight: number;
  blockTime: number;
  flowType: string;
  amountZec: number | null;
  actions?: number;
  pool: string;
  addresses: string[];
}

interface PaginationState {
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
  nextCursor: number | null;
  nextCursorId: number | null;
  prevCursor: number | null;
  prevCursorId: number | null;
}

interface ShieldedTxsClientProps {
  initialFlows?: ShieldedFlow[];
  initialPagination?: PaginationState | null;
  initialPage?: number;
  initialFlow?: FlowFilter;
  initialPool?: PoolFilter;
  initialMinZec?: number;
  initialCursor?: number | null;
  initialCursorId?: number | null;
  initialDirection?: 'next' | 'prev';
  initialUnavailable?: boolean;
}

function getFlowBadge(flowType: string) {
  return <ShieldFlowBadge type={resolveShieldFlowType({ flowType })} variant="compact" />;
}

function getPoolBadge(pool: string) {
  if (pool === 'ironwood') return <Badge color="amber">IRONWOOD</Badge>;
  if (pool === 'orchard') return <Badge color="purple">ORCHARD</Badge>;
  if (pool === 'sapling') return <Badge color="cyan">SAPLING</Badge>;
  if (pool === 'mixed') return <Badge color="orange">MIXED</Badge>;
  return <Badge color="muted">{pool.toUpperCase()}</Badge>;
}

const flowColumns: DataTableColumn<ShieldedFlow>[] = [
  {
    id: 'txid',
    header: 'TxID',
    skeletonWidth: 'w-28',
    cell: (flow) => (
      <HashLink value={flow.txid} href={`/tx/${flow.txid}`} lead={12} tail={6} responsive accent="purple" />
    ),
  },
  { id: 'flow', header: 'Flow', cell: (flow) => getFlowBadge(flow.flowType) },
  {
    id: 'pool',
    header: 'Pool',
    className: 'hidden lg:table-cell',
    skeletonWidth: 'w-16',
    cell: (flow) => getPoolBadge(flow.pool),
  },
  {
    id: 'amount',
    header: 'Amount',
    align: 'right',
    cell: (flow) => (
      <span className="font-mono text-xs text-primary">
        {flow.amountZec != null
          ? `${flow.amountZec.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })} ZEC`
          : <span className="text-muted">{flow.actions || '—'} actions</span>
        }
      </span>
    ),
  },
  {
    id: 'block',
    header: 'Block',
    align: 'right',
    className: 'hidden sm:table-cell',
    cell: (flow) => (
      <Link href={`/block/${flow.blockHeight}`} className="font-mono text-xs text-muted hover:text-cipher-cyan transition-colors">
        #{flow.blockHeight.toLocaleString()}
      </Link>
    ),
  },
  {
    id: 'age',
    header: 'Age',
    align: 'right',
    skeletonWidth: 'w-16',
    cell: (flow) => (
      <span className="text-xs text-muted whitespace-nowrap">{formatRelativeTime(flow.blockTime)}</span>
    ),
  },
];

export default function ShieldedTxsClient({
  initialFlows = [],
  initialPagination = null,
  initialPage = 1,
  initialFlow = 'all',
  initialPool = 'all',
  initialMinZec = 0,
  initialCursor = null,
  initialCursorId = null,
  initialDirection = 'next',
  initialUnavailable = false,
}: ShieldedTxsClientProps) {
  const PAGE_SIZE = 25;
  const hasInitialData = initialPagination !== null || initialFlows.length > 0;
  const fallbackStarted = useRef(false);
  const previousFilters = useRef({
    flow: initialFlow,
    pool: initialPool,
    minZec: initialMinZec,
  });
  const [flows, setFlows] = useState<ShieldedFlow[]>(initialFlows);
  const [loading, setLoading] = useState(!hasInitialData);
  const [dataAvailable, setDataAvailable] = useState(!initialUnavailable);
  const [flowFilter, setFlowFilter] = useState<FlowFilter>(initialFlow);
  const [poolFilter, setPoolFilter] = useState<PoolFilter>(initialPool);
  const [minZec, setMinZec] = useState<number>(initialMinZec);
  const [page, setPage] = useState(initialPage);
  const [pagination, setPagination] = useState<PaginationState>(initialPagination ?? {
    total: 0, totalPages: 0, hasNext: false, hasPrev: false,
    nextCursor: null, nextCursorId: null, prevCursor: null, prevCursorId: null,
  });

  const fetchFlows = useCallback(async (
    cursor?: number | null,
    cursorId?: number | null,
    direction?: 'next' | 'prev',
    flow?: FlowFilter,
    pool?: PoolFilter,
    minAmount?: number,
    targetPage = 1,
  ) => {
    setLoading(true);
    try {
      const base = usePostgresApiClient() ? getApiUrl() : '';
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE + 1),
        flow_type: flow || flowFilter,
        pool: pool || poolFilter,
      });
      const effectiveMin = minAmount !== undefined ? minAmount : minZec;
      if (effectiveMin > 0) {
        params.set('min_zec', String(effectiveMin));
      }
      if (cursor !== undefined && cursor !== null) {
        params.set('cursor', String(cursor));
        params.set('cursor_id', String(cursorId ?? 0));
        params.set('direction', direction || 'next');
      }
      const res = await fetch(`${base}/api/shielded/list?${params}`);
      if (!res.ok) throw new Error(`Shielded transaction list returned ${res.status}`);
      const json = await res.json();
      if (json.success) {
        const all: ShieldedFlow[] = json.flows || [];
        const reverseOffset = direction === 'prev' && all.length > PAGE_SIZE ? 1 : 0;
        const visibleFlows = all.slice(reverseOffset, reverseOffset + PAGE_SIZE);
        const firstFlow = visibleFlows[0] ?? null;
        const lastFlow = visibleFlows[visibleFlows.length - 1] ?? null;
        const total = Number(json.pagination?.total) || 0;
        setFlows(visibleFlows);
        setPagination({
          ...json.pagination,
          total,
          totalPages: Math.ceil(total / PAGE_SIZE),
          hasNext: direction === 'prev'
            ? cursor !== null && cursor !== undefined && visibleFlows.length > 0
            : all.length > PAGE_SIZE,
          hasPrev: targetPage > 1,
          nextCursor: lastFlow ? Number(lastFlow.blockTime) : null,
          nextCursorId: lastFlow ? Number(lastFlow.id) : null,
          prevCursor: firstFlow ? Number(firstFlow.blockTime) : null,
          prevCursorId: firstFlow ? Number(firstFlow.id) : null,
        });
        setDataAvailable(true);
      } else {
        setDataAvailable(false);
      }
    } catch (err) {
      console.error('Error fetching shielded flows:', err);
      setDataAvailable(false);
    } finally {
      setLoading(false);
    }
  }, [flowFilter, poolFilter, minZec]);

  useEffect(() => {
    if (hasInitialData || fallbackStarted.current) return;
    fallbackStarted.current = true;
    setPage(initialPage);
    fetchFlows(
      initialCursor,
      initialCursorId,
      initialDirection,
      initialFlow,
      initialPool,
      initialMinZec,
      initialPage,
    );
    // The initial request inputs are fixed for this keyed client instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const previous = previousFilters.current;
    if (
      previous.flow === flowFilter &&
      previous.pool === poolFilter &&
      previous.minZec === minZec
    ) return;
    previousFilters.current = { flow: flowFilter, pool: poolFilter, minZec };
    setPage(1);
    fetchFlows(null, null, undefined, flowFilter, poolFilter, minZec);
  }, [flowFilter, poolFilter, minZec]);

  const buildArchiveHref = (
    cursor: number | null,
    cursorId: number | null,
    direction: 'next' | 'prev',
    targetPage: number,
  ) => {
    const params = new URLSearchParams();
    if (flowFilter !== 'all') params.set('flow_type', flowFilter);
    if (poolFilter !== 'all') params.set('pool', poolFilter);
    if (minZec > 0) params.set('min_zec', String(minZec));
    if (targetPage > 1 && cursor !== null) {
      params.set('cursor', String(cursor));
      params.set('cursor_id', String(cursorId ?? 0));
      params.set('direction', direction);
      params.set('page', String(targetPage));
    }
    const query = params.toString();
    return query ? `/txs/shielded?${query}` : '/txs/shielded';
  };

  const firstHref = buildArchiveHref(null, null, 'next', 1);
  const prevHref = page <= 2
    ? firstHref
    : buildArchiveHref(pagination.prevCursor, pagination.prevCursorId, 'prev', page - 1);
  const nextHref = buildArchiveHref(pagination.nextCursor, pagination.nextCursorId, 'next', page + 1);

  const flowFilters: { id: FlowFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'shield', label: 'Shielding' },
    { id: 'deshield', label: 'Unshielding' },
    { id: 'fully_shielded', label: 'Fully Shielded' },
  ];

  const poolFilters: { id: PoolFilter; label: string }[] = [
    { id: 'all', label: 'All Pools' },
    { id: 'ironwood', label: 'Ironwood' },
    { id: 'orchard', label: 'Orchard' },
    { id: 'sapling', label: 'Sapling' },
    { id: 'mixed', label: 'Mixed' },
  ];

  const amountPresets = [
    { value: 0, label: 'Any' },
    { value: 10, label: '> 10 ZEC' },
    { value: 100, label: '> 100 ZEC' },
    { value: 1000, label: '> 1K ZEC' },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-12 animate-fade-in">
      {/* Header */}
      <PageHeader
        eyebrow="SHIELDED_TRANSACTIONS"
        title={page > 1
          ? `Zcash Shielded Transactions - Page ${page}`
          : 'Latest Zcash Shielded Transactions'}
        actions={
          <span className="text-xs font-mono text-muted">
            {!dataAvailable && flows.length === 0
              ? 'Shielded transaction data temporarily unavailable'
              : `${pagination.total.toLocaleString()} shielded txs`}
          </span>
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="filter-group inline-flex">
          {flowFilters.map(f => (
            <button
              key={f.id}
              onClick={() => setFlowFilter(f.id)}
              className={`filter-btn ${flowFilter === f.id ? 'filter-btn-active' : ''}`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="filter-group inline-flex">
          {poolFilters.map(f => (
            <button
              key={f.id}
              onClick={() => setPoolFilter(f.id)}
              className={`filter-btn ${poolFilter === f.id ? 'filter-btn-active' : ''}`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="filter-group inline-flex">
          {amountPresets.map(p => (
            <button
              key={p.value}
              onClick={() => setMinZec(p.value)}
              className={`filter-btn ${minZec === p.value ? 'filter-btn-active' : ''}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <DataTable
        columns={flowColumns}
        rows={flows}
        rowKey={(flow) => `${flow.txid}-${flow.flowType}`}
        loading={loading}
        footer={<ShieldFlowLegend />}
      />

      {/* Pagination */}
      <Pagination
        page={page}
        totalPages={pagination.totalPages}
        hasNext={pagination.hasNext}
        hasPrev={pagination.hasPrev}
        firstHref={firstHref}
        prevHref={prevHref}
        nextHref={nextHref}
        loading={loading}
      />
    </div>
  );
}
