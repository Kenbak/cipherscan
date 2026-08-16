'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { formatRelativeTime } from '@/lib/utils';
import { usePostgresApiClient, getApiUrl } from '@/lib/api-config';
import { Pagination } from '@/components/Pagination';
import { ShieldFlowBadge, ShieldFlowLegend } from '@/components/ShieldFlowBadge';
import { resolveShieldFlowType } from '@/components/icons/shield-flow';
import { PageHeader, MetricCard, DataTable, HashLink, TxTypeBadge, type DataTableColumn } from '@/components/ui';
import { usePaginatedList, type BasePaginationState } from '@/hooks/usePaginatedList';

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

interface ShieldedPaginationState extends BasePaginationState {
  nextCursorId: number | null;
  prevCursorId: number | null;
}

const PAGE_SIZE = 25;

interface ShieldedTxsClientProps {
  initialFlows?: ShieldedFlow[];
  initialPagination?: Partial<ShieldedPaginationState> | null;
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
  if (pool === 'ironwood' || pool === 'orchard' || pool === 'sapling' || pool === 'mixed') {
    return <TxTypeBadge category={pool} />;
  }
  return <TxTypeBadge category="transparent" label={pool.toUpperCase()} />;
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
          : <span className="text-muted italic">Private</span>
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
      <Link href={`/block/${flow.blockHeight}`} className="font-mono text-xs text-muted hover:text-primary transition-colors">
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
  const [flowFilter, setFlowFilter] = useState<FlowFilter>(initialFlow);
  const [poolFilter, setPoolFilter] = useState<PoolFilter>(initialPool);
  const [minZec, setMinZec] = useState<number>(initialMinZec);
  const [summary, setSummary] = useState<{ shieldedPct: number | null; avgPerDay: number | null; poolSize: string | null }>({ shieldedPct: null, avgPerDay: null, poolSize: null });
  const previousFilters = useRef({
    flow: initialFlow,
    pool: initialPool,
    minZec: initialMinZec,
  });

  const {
    items: flows,
    page,
    pagination,
    loading,
    dataAvailable,
    firstHref,
    prevHref,
    nextHref,
    fetchPage,
    setPage,
  } = usePaginatedList<ShieldedFlow, ShieldedPaginationState>({
    endpoint: '/api/shielded/list',
    pageSize: PAGE_SIZE,
    archiveBasePath: '/txs/shielded',
    secondaryCursorParam: 'cursor_id',
    secondaryCursorFields: { next: 'nextCursorId', prev: 'prevCursorId' },
    buildParams: () => {
      const params: Record<string, string> = {
        flow_type: flowFilter,
        pool: poolFilter,
      };
      if (minZec > 0) params.min_zec = String(minZec);
      return params;
    },
    getItemsFromResponse: (json) => (json.flows as ShieldedFlow[]) || [],
    getLatestKey: (flow) => `${flow.txid}:${flow.flowType}`,
    buildCursors: (visibleItems) => {
      const firstFlow = visibleItems[0] ?? null;
      const lastFlow = visibleItems[visibleItems.length - 1] ?? null;
      return {
        nextCursor: lastFlow ? Number(lastFlow.blockTime) : null,
        nextCursorId: lastFlow ? Number(lastFlow.id) : null,
        prevCursor: firstFlow ? Number(firstFlow.blockTime) : null,
        prevCursorId: firstFlow ? Number(firstFlow.id) : null,
      };
    },
    buildArchiveHref: (cursor, cursorId, direction, targetPage) => {
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
    },
    initialItems: initialFlows,
    initialPagination,
    initialPage,
    initialCursor,
    initialSecondaryCursor: initialCursorId,
    initialDirection,
    initialUnavailable,
  });

  useEffect(() => {
    const previous = previousFilters.current;
    if (
      previous.flow === flowFilter &&
      previous.pool === poolFilter &&
      previous.minZec === minZec
    ) return;
    previousFilters.current = { flow: flowFilter, pool: poolFilter, minZec };
    setPage(1);
    fetchPage({ cursor: null, secondaryCursor: null, targetPage: 1 });
  }, [flowFilter, poolFilter, minZec, fetchPage, setPage]);

  useEffect(() => {
    const base = usePostgresApiClient() ? getApiUrl() : '';
    fetch(`${base}/api/privacy-stats`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (!data) return;
        const pct = data.metrics?.shieldedPercentage != null ? Number(data.metrics.shieldedPercentage) : null;
        const avg = data.metrics?.avgShieldedPerDay != null ? Math.round(Number(data.metrics.avgShieldedPerDay)) : null;
        const poolVal = data.shieldedPool?.currentSize;
        const pool = poolVal != null
          ? Number(poolVal) >= 1_000_000
            ? `${(Number(poolVal) / 1_000_000).toFixed(2)}M ZEC`
            : `${Math.round(Number(poolVal)).toLocaleString()} ZEC`
          : null;
        setSummary({ shieldedPct: pct, avgPerDay: avg, poolSize: pool });
      })
      .catch(() => {});
  }, []);

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

      {/* Summary Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <MetricCard size="compact"
          label="Shielded Txs"
          value={pagination.total > 0 ? pagination.total.toLocaleString() : '—'}
        />
        <MetricCard size="compact"
          label="% Shielded"
          value={summary.shieldedPct != null ? `${summary.shieldedPct.toFixed(1)}%` : '—'}
        />
        <MetricCard size="compact"
          label="Avg Shielded / Day"
          value={summary.avgPerDay != null ? summary.avgPerDay.toLocaleString() : '—'}
        />
        <MetricCard size="compact"
          label="Shielded Pool"
          value={summary.poolSize ?? '—'}
        />
      </div>

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
