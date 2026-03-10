'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { formatRelativeTime } from '@/lib/utils';
import { usePostgresApiClient, getApiUrl } from '@/lib/api-config';
import { Pagination } from '@/components/Pagination';
import { Badge } from '@/components/ui';

type TxType = 'all' | 'shielded' | 'transparent' | 'coinbase';

interface Transaction {
  txid: string;
  block_height: number;
  block_time: number;
  size: number;
  vin_count: number;
  vout_count: number;
  has_sapling: boolean;
  has_orchard: boolean;
  has_sprout: boolean;
  is_coinbase: boolean;
  value_balance: number;
  value_balance_sapling: number;
  value_balance_orchard: number;
  flow_type: string | null;
  tx_index?: number;
}

interface PaginationState {
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
  nextCursor: number | null;
  nextCursorIdx: number | null;
  prevCursor: number | null;
  prevCursorIdx: number | null;
}

function getTxBadge(tx: Transaction) {
  if (tx.is_coinbase) return <Badge color="green">COINBASE</Badge>;
  if (tx.has_orchard && tx.has_sapling) return <Badge color="purple">ORCHARD+SAPLING</Badge>;
  if (tx.has_orchard) return <Badge color="purple">ORCHARD</Badge>;
  if (tx.has_sapling) return <Badge color="purple">SAPLING</Badge>;
  return <Badge color="muted">TRANSPARENT</Badge>;
}

function getFlowBadge(tx: Transaction) {
  if (tx.is_coinbase) return null;
  const ft = tx.flow_type;
  if (ft === 'shielding') return <Badge color="green">↓ SHIELD</Badge>;
  if (ft === 'deshielding') return <Badge color="orange">↑ UNSHIELD</Badge>;
  if (ft === 'mixed') return <Badge color="orange">MIXED</Badge>;
  if (ft === 'fully_shielded') return <Badge color="purple">SHIELDED</Badge>;
  return null;
}

export default function TransactionsPage() {
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<TxType>('all');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<PaginationState>({
    total: 0, totalPages: 0, hasNext: false, hasPrev: false,
    nextCursor: null, nextCursorIdx: null, prevCursor: null, prevCursorIdx: null,
  });

  const fetchTxs = useCallback(async (cursor?: number | null, cursorIdx?: number | null, direction?: string, type?: TxType) => {
    setLoading(true);
    try {
      const base = usePostgresApiClient() ? getApiUrl() : '';
      const params = new URLSearchParams({ limit: '25', type: type || typeFilter });
      if (cursor !== undefined && cursor !== null) {
        params.set('cursor', String(cursor));
        params.set('cursor_idx', String(cursorIdx ?? 0));
        params.set('direction', direction || 'next');
      }
      const res = await fetch(`${base}/api/transactions/list?${params}`);
      const json = await res.json();
      if (json.success) {
        setTxs(json.transactions);
        setPagination(json.pagination);
      }
    } catch (err) {
      console.error('Error fetching transactions:', err);
    } finally {
      setLoading(false);
    }
  }, [typeFilter]);

  useEffect(() => {
    setPage(1);
    fetchTxs(null, null, undefined, typeFilter);
  }, [typeFilter]);

  const goFirst = () => { setPage(1); fetchTxs(null, null, undefined); };
  const goPrev = () => { setPage(p => p - 1); fetchTxs(pagination.prevCursor, pagination.prevCursorIdx, 'prev'); };
  const goNext = () => { setPage(p => p + 1); fetchTxs(pagination.nextCursor, pagination.nextCursorIdx, 'next'); };

  const filters: { id: TxType; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'shielded', label: 'Shielded' },
    { id: 'transparent', label: 'Transparent' },
    { id: 'coinbase', label: 'Coinbase' },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-12 animate-fade-in">
      {/* Header */}
      <div className="mb-6">
        <p className="text-xs text-muted font-mono uppercase tracking-widest mb-3">
          <span className="opacity-50">{'>'}</span> ALL_TRANSACTIONS
        </p>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h1 className="text-2xl sm:text-3xl font-bold text-primary">Transactions</h1>
          <span className="text-xs font-mono text-muted">
            {pagination.total.toLocaleString()} transactions
          </span>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-4">
        <div className="filter-group inline-flex">
          {filters.map(f => (
            <button
              key={f.id}
              onClick={() => setTypeFilter(f.id)}
              className={`filter-btn ${typeFilter === f.id ? 'filter-btn-active' : ''}`}
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
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted border-b border-cipher-border">Type</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted border-b border-cipher-border hidden lg:table-cell">Flow</th>
                <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-muted border-b border-cipher-border hidden sm:table-cell">Block</th>
                <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-muted border-b border-cipher-border hidden md:table-cell">Size</th>
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
                    <td className="px-4 py-3.5 border-b border-cipher-border hidden sm:table-cell"><div className="h-4 w-20 bg-cipher-border rounded ml-auto" /></td>
                    <td className="px-4 py-3.5 border-b border-cipher-border hidden md:table-cell"><div className="h-4 w-14 bg-cipher-border rounded ml-auto" /></td>
                    <td className="px-4 py-3.5 border-b border-cipher-border"><div className="h-4 w-16 bg-cipher-border rounded ml-auto" /></td>
                  </tr>
                ))
              ) : txs.map((tx) => (
                <tr key={tx.txid} className="group transition-colors duration-100 hover:bg-[var(--color-hover)]">
                  <td className="px-4 h-[44px] border-b border-cipher-border">
                    <Link href={`/tx/${tx.txid}`} className="font-mono text-xs text-primary hover:text-cipher-cyan transition-colors truncate block max-w-[120px] sm:max-w-[180px]">
                      <span className="sm:hidden">{tx.txid.slice(0, 8)}...{tx.txid.slice(-4)}</span>
                      <span className="hidden sm:inline">{tx.txid.slice(0, 12)}...{tx.txid.slice(-6)}</span>
                    </Link>
                  </td>
                  <td className="px-4 h-[44px] border-b border-cipher-border">
                    {getTxBadge(tx)}
                  </td>
                  <td className="px-4 h-[44px] border-b border-cipher-border hidden lg:table-cell">
                    {getFlowBadge(tx)}
                  </td>
                  <td className="px-4 h-[44px] border-b border-cipher-border text-right hidden sm:table-cell">
                    <Link href={`/block/${tx.block_height}`} className="font-mono text-xs text-muted hover:text-cipher-cyan transition-colors">
                      #{tx.block_height.toLocaleString()}
                    </Link>
                  </td>
                  <td className="px-4 h-[44px] border-b border-cipher-border text-right hidden md:table-cell">
                    <span className="font-mono text-xs text-muted">{tx.size ? `${(tx.size / 1024).toFixed(1)} KB` : '—'}</span>
                  </td>
                  <td className="px-4 h-[44px] border-b border-cipher-border text-right">
                    <span className="text-xs text-muted whitespace-nowrap">{formatRelativeTime(tx.block_time)}</span>
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
