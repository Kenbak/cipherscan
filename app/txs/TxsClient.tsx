'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import Link from 'next/link';
import { formatRelativeTime } from '@/lib/utils';
import { usePostgresApiClient, getApiUrl } from '@/lib/api-config';
import { Pagination } from '@/components/Pagination';
import { ShieldFlowBadge } from '@/components/ShieldFlowBadge';
import { resolveShieldFlowType } from '@/components/icons/shield-flow';
import { Badge, PageHeader, MetricCard, Tabs, DataTable, HashLink, type DataTableColumn } from '@/components/ui';
import { useTheme } from '@/contexts/ThemeContext';
import { getChartColors } from '@/lib/chart-theme';
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';

type TxType = 'all' | 'shielded' | 'transparent' | 'coinbase';
type ViewTab = 'recent' | 'trends';

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

interface TrendDay {
  date: string;
  shielded: number;
  transparent: number;
  shieldedPercentage: number;
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

type TrendPeriod = '7' | '30' | '365' | 'all';

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const PERIOD_OPTIONS: { id: TrendPeriod; label: string }[] = [
  { id: '7', label: '7D' },
  { id: '30', label: '30D' },
  { id: '365', label: '1Y' },
  { id: 'all', label: 'All' },
];

function TrendsChart() {
  const { theme } = useTheme();
  const colors = getChartColors(theme);
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const [period, setPeriod] = useState<TrendPeriod>('30');
  const [data, setData] = useState<TrendDay[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const base = usePostgresApiClient() ? getApiUrl() : '';
    const days = period === 'all' ? 1000 : Number(period);
    fetch(`${base}/api/privacy-stats?days=${days}`)
      .then(res => res.ok ? res.json() : null)
      .then(json => {
        if (json?.trends?.daily) setData(json.trends.daily);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [period]);

  const chartData = useMemo(
    () => [...data].reverse().map(d => ({
      date: formatDateShort(d.date),
      shielded: d.shielded,
      transparent: d.transparent,
      shieldedPct: d.shieldedPercentage,
    })),
    [data],
  );

  const derived = useMemo(() => {
    if (data.length === 0) return { totalTxs: 0, avgDaily: 0, peakDay: null };
    const totalTxs = data.reduce((s, d) => s + d.shielded + d.transparent, 0);
    const avgDaily = Math.round(totalTxs / data.length);
    const peakDay = data.reduce((best, d) => (d.shielded + d.transparent) > (best.shielded + best.transparent) ? d : best, data[0]);
    return { totalTxs, avgDaily, peakDay };
  }, [data]);

  const periodLabel = period === 'all' ? 'All Time' : period === '365' ? '1 Year' : `${period} Days`;

  return (
    <div>
      <div className="card p-4 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-mono text-muted uppercase tracking-wider">Daily Transaction Volume</h3>
          <div className="filter-group inline-flex">
            {PERIOD_OPTIONS.map(p => (
              <button
                key={p.id}
                onClick={() => setPeriod(p.id)}
                className={`filter-btn ${period === p.id ? 'filter-btn-active' : ''}`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        {loading ? (
          <div className="h-[320px] flex items-center justify-center text-muted text-sm">Loading...</div>
        ) : (
        <div className="h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: colors.axis }}
                tickLine={false}
                axisLine={{ stroke: colors.grid }}
                interval="preserveStartEnd"
              />
              <YAxis
                yAxisId="left"
                tick={{ fontSize: 11, fill: colors.axis }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(v)}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fontSize: 11, fill: colors.axis }}
                tickLine={false}
                axisLine={false}
                domain={[0, 100]}
                tickFormatter={(v: number) => `${v}%`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: colors.tooltipBg,
                  border: `1px solid ${colors.tooltipBorder}`,
                  borderRadius: 8,
                  fontSize: 12,
                }}
                labelStyle={{ color: colors.tooltipText, fontWeight: 600, marginBottom: 4 }}
                itemStyle={{ color: colors.tooltipText }}
                formatter={(value: unknown, name: unknown) => {
                  const v = Number(value);
                  const n = String(name);
                  if (n === 'shieldedPct') return [`${v.toFixed(1)}%`, 'Shielded %'];
                  return [v.toLocaleString(), n === 'shielded' ? 'Shielded Txs' : 'Transparent Txs'];
                }}
              />
              <Legend
                wrapperStyle={{ fontSize: 11, cursor: 'pointer' }}
                onClick={(entry) => {
                  const key = (entry as { dataKey?: string }).dataKey;
                  if (key) setHidden(prev => ({ ...prev, [key]: !prev[key] }));
                }}
                formatter={(value: string) => {
                  const labels: Record<string, string> = { shielded: 'Shielded Txs', transparent: 'Transparent Txs', shieldedPct: 'Shielded %' };
                  return <span style={{ opacity: hidden[value] ? 0.4 : 1 }}>{labels[value] || value}</span>;
                }}
              />
              <Area
                yAxisId="left"
                type="monotone"
                dataKey="transparent"
                stackId="txs"
                fill={colors.transparent}
                fillOpacity={0.3}
                stroke={colors.transparent}
                strokeWidth={1.5}
                hide={!!hidden['transparent']}
              />
              <Area
                yAxisId="left"
                type="monotone"
                dataKey="shielded"
                stackId="txs"
                fill={colors.shielded}
                fillOpacity={0.4}
                stroke={colors.shielded}
                strokeWidth={1.5}
                hide={!!hidden['shielded']}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="shieldedPct"
                stroke={colors.cyan}
                strokeWidth={2}
                dot={false}
                hide={!!hidden['shieldedPct']}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        )}
      </div>

      {/* Derived stats below chart */}
      <div className="grid grid-cols-3 gap-3 mt-4">
        <MetricCard size="compact"
          label={`Total (${periodLabel})`}
          value={derived.totalTxs.toLocaleString()}
        />
        <MetricCard size="compact"
          label="Avg Daily"
          value={derived.avgDaily.toLocaleString()}
        />
        <MetricCard size="compact"
          label="Peak Day"
          value={derived.peakDay ? `${formatDateShort(derived.peakDay.date)} — ${(derived.peakDay.shielded + derived.peakDay.transparent).toLocaleString()}` : '—'}
        />
      </div>
    </div>
  );
}

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
  const [viewTab, setViewTab] = useState<ViewTab>('recent');
  const [summary, setSummary] = useState<{ txs24h: number | null; shieldedPct24h: number | null; txsPerBlock: number | null }>({ txs24h: null, shieldedPct24h: null, txsPerBlock: null });
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (previousTypeFilter.current === typeFilter) return;
    previousTypeFilter.current = typeFilter;
    setPage(1);
    fetchTxs(null, null, undefined, typeFilter);
  }, [typeFilter]);

  useEffect(() => {
    const base = usePostgresApiClient() ? getApiUrl() : '';
    Promise.allSettled([
      fetch(`${base}/api/network/stats`),
      fetch(`${base}/api/privacy-stats`),
    ]).then(async ([networkRes, privacyRes]) => {
      let txs24h: number | null = null;
      let txsPerBlock: number | null = null;
      if (networkRes.status === 'fulfilled' && networkRes.value.ok) {
        const data = await networkRes.value.json();
        txs24h = data.blockchain?.tx24h ? Number(data.blockchain.tx24h) : null;
        const blocks24h = data.mining?.blocks24h ? Number(data.mining.blocks24h) : null;
        txsPerBlock = txs24h && blocks24h ? Math.round((txs24h / blocks24h) * 10) / 10 : null;
      }
      let shieldedPct24h: number | null = null;
      if (privacyRes.status === 'fulfilled' && privacyRes.value.ok) {
        const data = await privacyRes.value.json();
        const dailyTrends = data.trends?.daily || [];
        if (dailyTrends.length > 0) {
          shieldedPct24h = dailyTrends[0].shieldedPercentage;
        }
      }
      setSummary({ txs24h, shieldedPct24h, txsPerBlock });
    });
  }, []);

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

  const viewTabs: { id: ViewTab; label: string }[] = [
    { id: 'recent', label: 'Recent Transactions' },
    { id: 'trends', label: 'Trends' },
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

      {/* Summary Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <MetricCard size="compact"
          label="Total Transactions"
          value={pagination.total > 0 ? pagination.total.toLocaleString() : '—'}
        />
        <MetricCard size="compact"
          label="Transactions (24h)"
          value={summary.txs24h != null ? summary.txs24h.toLocaleString() : '—'}
        />
        <MetricCard size="compact"
          label="% Shielded (24h)"
          value={summary.shieldedPct24h != null ? `${summary.shieldedPct24h.toFixed(1)}%` : '—'}
        />
        <MetricCard size="compact"
          label="Txs Per Block"
          value={summary.txsPerBlock != null ? summary.txsPerBlock.toLocaleString() : '—'}
        />
      </div>

      {/* View Tabs */}
      <Tabs tabs={viewTabs} active={viewTab} onChange={setViewTab} className="mb-6" />

      {viewTab === 'recent' && (
        <>
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
        </>
      )}

      {viewTab === 'trends' && <TrendsChart />}
    </div>
  );
}
