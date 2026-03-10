'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { formatRelativeTime } from '@/lib/utils';
import { usePostgresApiClient, getApiUrl } from '@/lib/api-config';
import { Pagination } from '@/components/Pagination';
import { Badge } from '@/components/ui';

type FlowFilter = 'all' | 'shield' | 'deshield';
type PoolFilter = 'all' | 'sapling' | 'orchard' | 'mixed';

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

function getFlowBadge(flowType: string) {
  if (flowType === 'shield') return <Badge color="green">↓ SHIELDING</Badge>;
  if (flowType === 'deshield') return <Badge color="orange">↑ UNSHIELDING</Badge>;
  return <Badge color="muted">{flowType}</Badge>;
}

function getPoolBadge(pool: string) {
  if (pool === 'orchard') return <Badge color="purple">ORCHARD</Badge>;
  if (pool === 'sapling') return <Badge color="cyan">SAPLING</Badge>;
  if (pool === 'mixed') return <Badge color="orange">MIXED</Badge>;
  return <Badge color="muted">{pool}</Badge>;
}

export default function ShieldedTxsPage() {
  const [flows, setFlows] = useState<ShieldedFlow[]>([]);
  const [loading, setLoading] = useState(true);
  const [flowFilter, setFlowFilter] = useState<FlowFilter>('all');
  const [poolFilter, setPoolFilter] = useState<PoolFilter>('all');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<PaginationState>({
    total: 0, totalPages: 0, hasNext: false, hasPrev: false,
    nextCursor: null, nextCursorId: null, prevCursor: null, prevCursorId: null,
  });

  const fetchFlows = useCallback(async (cursor?: number | null, cursorId?: number | null, direction?: string, flow?: FlowFilter, pool?: PoolFilter) => {
    setLoading(true);
    try {
      const base = usePostgresApiClient() ? getApiUrl() : '';
      const params = new URLSearchParams({
        limit: '25',
        flow_type: flow || flowFilter,
        pool: pool || poolFilter,
      });
      if (cursor !== undefined && cursor !== null) {
        params.set('cursor', String(cursor));
        params.set('cursor_id', String(cursorId ?? 0));
        params.set('direction', direction || 'next');
      }
      const res = await fetch(`${base}/api/shielded/list?${params}`);
      const json = await res.json();
      if (json.success) {
        setFlows(json.flows);
        setPagination(json.pagination);
      }
    } catch (err) {
      console.error('Error fetching shielded flows:', err);
    } finally {
      setLoading(false);
    }
  }, [flowFilter, poolFilter]);

  useEffect(() => {
    setPage(1);
    fetchFlows(null, null, undefined, flowFilter, poolFilter);
  }, [flowFilter, poolFilter]);

  const goFirst = () => { setPage(1); fetchFlows(null, null, undefined); };
  const goPrev = () => { setPage(p => p - 1); fetchFlows(pagination.prevCursor, pagination.prevCursorId, 'prev'); };
  const goNext = () => { setPage(p => p + 1); fetchFlows(pagination.nextCursor, pagination.nextCursorId, 'next'); };

  const flowFilters: { id: FlowFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'shield', label: 'Shielding' },
    { id: 'deshield', label: 'Unshielding' },
  ];

  const poolFilters: { id: PoolFilter; label: string }[] = [
    { id: 'all', label: 'All Pools' },
    { id: 'orchard', label: 'Orchard' },
    { id: 'sapling', label: 'Sapling' },
    { id: 'mixed', label: 'Mixed' },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-12 animate-fade-in">
      {/* Header */}
      <div className="mb-6">
        <p className="text-xs text-muted font-mono uppercase tracking-widest mb-3">
          <span className="opacity-50">{'>'}</span> SHIELDED_TRANSACTIONS
        </p>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h1 className="text-2xl sm:text-3xl font-bold text-primary">Shielded Transactions</h1>
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
      </div>

      {/* Pagination */}
      <Pagination
        page={page}
        totalPages={pagination.totalPages}
        hasNext={pagination.hasNext}
        hasPrev={pagination.hasPrev}
        onFirst={goFirst}
        onPrev={goPrev}
        onNext={goNext}
        loading={loading}
      />
    </div>
  );
}
