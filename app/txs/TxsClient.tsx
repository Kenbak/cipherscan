'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { formatRelativeTime } from '@/lib/utils';
import { usePostgresApiClient, getApiUrl } from '@/lib/api-config';
import { Pagination } from '@/components/Pagination';
import { ShieldFlowBadge } from '@/components/ShieldFlowBadge';
import { resolveShieldFlowType } from '@/components/icons/shield-flow';
import { Badge, PageHeader, DataTable, HashLink, type DataTableColumn } from '@/components/ui';

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
  has_ironwood: boolean;
  has_sprout: boolean;
  is_coinbase: boolean;
  value_balance: number;
  value_balance_sapling: number;
  value_balance_orchard: number;
  value_balance_ironwood: number;
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
  if (tx.has_ironwood) return <Badge color="amber">IRONWOOD</Badge>;
  if (tx.has_orchard && tx.has_sapling) return <Badge color="purple">ORCHARD+SAPLING</Badge>;
  if (tx.has_orchard) return <Badge color="purple">ORCHARD</Badge>;
  if (tx.has_sapling) return <Badge color="cyan">SAPLING</Badge>;
  return <Badge color="muted">TRANSPARENT</Badge>;
}

function getFlowBadge(tx: Transaction) {
  if (tx.is_coinbase) return null;
  const type = resolveShieldFlowType({ flowType: tx.flow_type });
  if (type === 'mixed' && !tx.flow_type) return null;
  return <ShieldFlowBadge type={type} variant="compact" />;
}

const txColumns: DataTableColumn<Transaction>[] = [
  {
    id: 'txid',
    header: 'TxID',
    skeletonWidth: 'w-28',
    cell: (tx) => (
      <HashLink value={tx.txid} href={`/tx/${tx.txid}`} lead={12} tail={6} responsive />
    ),
  },
  { id: 'type', header: 'Type', cell: (tx) => getTxBadge(tx) },
  {
    id: 'flow',
    header: 'Flow',
    className: 'hidden lg:table-cell',
    skeletonWidth: 'w-16',
    cell: (tx) => getFlowBadge(tx),
  },
  {
    id: 'block',
    header: 'Block',
    align: 'right',
    className: 'hidden sm:table-cell',
    cell: (tx) => (
      <Link href={`/block/${tx.block_height}`} className="font-mono text-xs text-muted hover:text-cipher-cyan transition-colors">
        #{tx.block_height.toLocaleString()}
      </Link>
    ),
  },
  {
    id: 'size',
    header: 'Size',
    align: 'right',
    className: 'hidden md:table-cell',
    skeletonWidth: 'w-14',
    cell: (tx) => (
      <span className="font-mono text-xs text-muted">{tx.size ? `${(tx.size / 1024).toFixed(1)} KB` : '—'}</span>
    ),
  },
  {
    id: 'age',
    header: 'Age',
    align: 'right',
    skeletonWidth: 'w-16',
    cell: (tx) => (
      <span className="text-xs text-muted whitespace-nowrap">{formatRelativeTime(tx.block_time)}</span>
    ),
  },
];

interface TxsClientProps {
  initialTxs?: Transaction[];
  initialPagination?: PaginationState | null;
  initialPage?: number;
  initialType?: TxType;
  initialCursor?: number | null;
  initialCursorIdx?: number | null;
  initialDirection?: 'next' | 'prev';
  initialUnavailable?: boolean;
}

export default function TxsClient({
  initialTxs = [],
  initialPagination = null,
  initialPage = 1,
  initialType = 'all',
  initialCursor = null,
  initialCursorIdx = null,
  initialDirection = 'next',
  initialUnavailable = false,
}: TxsClientProps) {
  const PAGE_SIZE = 25;
  const hasInitialData = initialPagination !== null || initialTxs.length > 0;
  const fallbackStarted = useRef(false);
  const previousTypeFilter = useRef<TxType>(initialType);
  const [txs, setTxs] = useState<Transaction[]>(initialTxs);
  const [loading, setLoading] = useState(!hasInitialData);
  const [dataAvailable, setDataAvailable] = useState(!initialUnavailable);
  const [typeFilter, setTypeFilter] = useState<TxType>(initialType);
  const [page, setPage] = useState(initialPage);
  const [pagination, setPagination] = useState<PaginationState>(initialPagination ?? {
    total: 0, totalPages: 0, hasNext: false, hasPrev: false,
    nextCursor: null, nextCursorIdx: null, prevCursor: null, prevCursorIdx: null,
  });

  const fetchTxs = useCallback(async (
    cursor?: number | null,
    cursorIdx?: number | null,
    direction?: 'next' | 'prev',
    type?: TxType,
    targetPage = 1,
  ) => {
    setLoading(true);
    try {
      const base = usePostgresApiClient() ? getApiUrl() : '';
      const params = new URLSearchParams({ limit: String(PAGE_SIZE + 1), type: type || typeFilter });
      if (cursor !== undefined && cursor !== null) {
        params.set('cursor', String(cursor));
        params.set('cursor_idx', String(cursorIdx ?? 0));
        params.set('direction', direction || 'next');
      }
      const res = await fetch(`${base}/api/transactions/list?${params}`);
      if (!res.ok) throw new Error(`Transaction list returned ${res.status}`);
      const json = await res.json();
      if (json.success) {
        const all: Transaction[] = json.transactions || [];
        const reverseOffset = direction === 'prev' && all.length > PAGE_SIZE ? 1 : 0;
        const visibleTxs = all.slice(reverseOffset, reverseOffset + PAGE_SIZE);
        const firstTx = visibleTxs[0] ?? null;
        const lastTx = visibleTxs[visibleTxs.length - 1] ?? null;
        const total = Number(json.pagination?.total) || 0;
        setTxs(visibleTxs);
        setPagination({
          ...json.pagination,
          total,
          totalPages: Math.ceil(total / PAGE_SIZE),
          hasNext: direction === 'prev'
            ? cursor !== null && cursor !== undefined && visibleTxs.length > 0
            : all.length > PAGE_SIZE,
          hasPrev: targetPage > 1,
          nextCursor: lastTx ? Number(lastTx.block_height) : null,
          nextCursorIdx: lastTx ? Number(lastTx.tx_index ?? 0) : null,
          prevCursor: firstTx ? Number(firstTx.block_height) : null,
          prevCursorIdx: firstTx ? Number(firstTx.tx_index ?? 0) : null,
        });
        setDataAvailable(true);
      } else {
        setDataAvailable(false);
      }
    } catch (err) {
      console.error('Error fetching transactions:', err);
      setDataAvailable(false);
    } finally {
      setLoading(false);
    }
  }, [typeFilter]);

  useEffect(() => {
    if (hasInitialData || fallbackStarted.current) return;
    fallbackStarted.current = true;
    setPage(initialPage);
    fetchTxs(initialCursor, initialCursorIdx, initialDirection, initialType, initialPage);
    // The initial request inputs are fixed for this keyed client instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (previousTypeFilter.current === typeFilter) return;
    previousTypeFilter.current = typeFilter;
    setPage(1);
    fetchTxs(null, null, undefined, typeFilter);
  }, [typeFilter]);

  const buildArchiveHref = (
    cursor: number | null,
    cursorIdx: number | null,
    direction: 'next' | 'prev',
    targetPage: number,
  ) => {
    const params = new URLSearchParams();
    if (typeFilter !== 'all') params.set('type', typeFilter);
    if (targetPage > 1 && cursor !== null) {
      params.set('cursor', String(cursor));
      params.set('cursor_idx', String(cursorIdx ?? 0));
      params.set('direction', direction);
      params.set('page', String(targetPage));
    }
    const query = params.toString();
    return query ? `/txs?${query}` : '/txs';
  };

  const firstHref = buildArchiveHref(null, null, 'next', 1);
  const prevHref = page <= 2
    ? firstHref
    : buildArchiveHref(pagination.prevCursor, pagination.prevCursorIdx, 'prev', page - 1);
  const nextHref = buildArchiveHref(pagination.nextCursor, pagination.nextCursorIdx, 'next', page + 1);

  const filters: { id: TxType; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'shielded', label: 'Shielded' },
    { id: 'transparent', label: 'Transparent' },
    { id: 'coinbase', label: 'Coinbase' },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-12 animate-fade-in">
      <PageHeader
        eyebrow="ALL_TRANSACTIONS"
        title={page > 1 ? `Zcash Transactions - Page ${page}` : 'Latest Zcash Transactions'}
        actions={
          <span className="text-xs font-mono text-muted">
            {!dataAvailable && txs.length === 0
              ? 'Transaction data temporarily unavailable'
              : `${pagination.total.toLocaleString()} transactions`}
          </span>
        }
      />

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
      <DataTable
        columns={txColumns}
        rows={txs}
        rowKey={(tx) => tx.txid}
        loading={loading}
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
