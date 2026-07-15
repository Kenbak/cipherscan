'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { formatRelativeTime } from '@/lib/utils';
import { usePostgresApiClient, getApiUrl } from '@/lib/api-config';
import { Pagination } from '@/components/Pagination';
import { ShieldFlowBadge, ShieldFlowLegend } from '@/components/ShieldFlowBadge';
import { resolveShieldFlowType } from '@/components/icons/shield-flow';
import { Badge } from '@/components/ui';

type FlowFilter = 'all' | 'shield' | 'deshield';
type PoolFilter = 'all' | 'ironwood' | 'sapling' | 'orchard' | 'mixed';

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
      }
    } catch (err) {
      console.error('Error fetching shielded flows:', err);
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
      <div className="mb-6">
        <p className="text-xs text-muted font-mono uppercase tracking-widest mb-3">
          <span className="opacity-50">{'>'}</span> SHIELDED_TRANSACTIONS
        </p>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h1 className="text-2xl sm:text-3xl font-bold text-primary">
            {page > 1
              ? `Zcash Shielded Transactions - Page ${page}`
              : 'Latest Zcash Shielded Transactions'}
          </h1>
          <span className="text-xs font-mono text-muted">
            {pagination.total.toLocaleString()} shielded txs
          </span>
        </div>
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
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted border-b border-cipher-border">TxID</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted border-b border-cipher-border">Flow</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted border-b border-cipher-border hidden lg:table-cell">Pool</th>
                <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-muted border-b border-cipher-border">Amount</th>
                <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-muted border-b border-cipher-border hidden sm:table-cell">Block</th>
                <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-muted border-b border-cipher-border">Age</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 15 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-4 py-3.5 border-b border-cipher-border"><div className="h-4 w-28 bg-cipher-border rounded" /></td>
                    <td className="px-4 py-3.5 border-b border-cipher-border"><div className="h-4 w-20 bg-cipher-border rounded" /></td>
                    <td className="px-4 py-3.5 border-b border-cipher-border hidden lg:table-cell"><div className="h-4 w-16 bg-cipher-border rounded" /></td>
                    <td className="px-4 py-3.5 border-b border-cipher-border"><div className="h-4 w-20 bg-cipher-border rounded ml-auto" /></td>
                    <td className="px-4 py-3.5 border-b border-cipher-border hidden sm:table-cell"><div className="h-4 w-20 bg-cipher-border rounded ml-auto" /></td>
                    <td className="px-4 py-3.5 border-b border-cipher-border"><div className="h-4 w-16 bg-cipher-border rounded ml-auto" /></td>
                  </tr>
                ))
              ) : flows.map((flow) => (
                <tr key={`${flow.txid}-${flow.flowType}`} className="group transition-colors duration-100 hover:bg-[var(--color-hover)]">
                  <td className="px-4 h-[44px] border-b border-cipher-border">
                    <Link href={`/tx/${flow.txid}`} className="font-mono text-xs text-primary hover:text-cipher-purple transition-colors truncate block max-w-[120px] sm:max-w-[180px]">
                      <span className="sm:hidden">{flow.txid.slice(0, 8)}...{flow.txid.slice(-4)}</span>
                      <span className="hidden sm:inline">{flow.txid.slice(0, 12)}...{flow.txid.slice(-6)}</span>
                    </Link>
                  </td>
                  <td className="px-4 h-[44px] border-b border-cipher-border">
                    {getFlowBadge(flow.flowType)}
                  </td>
                  <td className="px-4 h-[44px] border-b border-cipher-border hidden lg:table-cell">
                    {getPoolBadge(flow.pool)}
                  </td>
                  <td className="px-4 h-[44px] border-b border-cipher-border text-right">
                    <span className="font-mono text-xs text-primary">{flow.amountZec.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })} ZEC</span>
                  </td>
                  <td className="px-4 h-[44px] border-b border-cipher-border text-right hidden sm:table-cell">
                    <Link href={`/block/${flow.blockHeight}`} className="font-mono text-xs text-muted hover:text-cipher-cyan transition-colors">
                      #{flow.blockHeight.toLocaleString()}
                    </Link>
                  </td>
                  <td className="px-4 h-[44px] border-b border-cipher-border text-right">
                    <span className="text-xs text-muted whitespace-nowrap">{formatRelativeTime(flow.blockTime)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ShieldFlowLegend />
      </div>

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
