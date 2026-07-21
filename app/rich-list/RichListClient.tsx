'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { PageHeader, DataTable, HashLink, type DataTableColumn } from '@/components/ui';
import { API_CONFIG } from '@/lib/api-config';
import { Card, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Pagination } from '@/components/Pagination';

const PAGE_SIZE = 100;

export interface RichListEntry {
  rank: number;
  address: string;
  balance: number;
  totalReceived: number;
  totalSent: number;
  txCount: number;
  firstSeen: number | null;
  lastSeen: number | null;
  label: string | null;
  category: string | null;
  description: string | null;
  verified: boolean;
  logoUrl: string | null;
}

export interface Concentration {
  top10: number;
  top100: number;
  totalTransparent: number;
  top10Pct: number;
  top100Pct: number;
}

export interface PaginationData {
  total: number;
  limit: number;
  offset: number;
  totalPages: number;
  page: number;
  hasNext: boolean;
  hasPrev: boolean;
}

type BadgeColor = 'cyan' | 'purple' | 'green' | 'orange' | 'muted';

function categoryColor(cat: string | null): BadgeColor {
  if (!cat) return 'muted';
  const c = cat.toLowerCase();
  if (c === 'exchange') return 'cyan';
  if (c === 'mining' || c === 'mining_pool') return 'orange';
  if (c === 'defi' || c === 'bridge') return 'green';
  if (c === 'custodian' || c === 'fund') return 'purple';
  return 'muted';
}

function formatZec(amount: number): string {
  if (amount >= 1e6) return `${(amount / 1e6).toFixed(2)}M`;
  if (amount >= 1e3) return `${(amount / 1e3).toFixed(1)}K`;
  return amount.toFixed(2);
}

interface RichListClientProps {
  initialAddresses?: RichListEntry[];
  initialConcentration?: Concentration | null;
  initialPagination?: PaginationData | null;
}

export default function RichListClient({
  initialAddresses = [],
  initialConcentration = null,
  initialPagination = null,
}: RichListClientProps) {
  const hasInitialData = initialPagination !== null;
  const skipInitialRefresh = useRef(hasInitialData);
  const [addresses, setAddresses] = useState<RichListEntry[]>(initialAddresses);
  const [concentration, setConcentration] = useState<Concentration | null>(initialConcentration);
  const [pagination, setPagination] = useState<PaginationData | null>(initialPagination);
  const [loading, setLoading] = useState(!hasInitialData);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [zecPrice, setZecPrice] = useState<number | null>(null);

  useEffect(() => {
    fetch(`${API_CONFIG.POSTGRES_API_URL}/api/price`)
      .then(r => r.json())
      .then(d => setZecPrice(d.price))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (page === 1 && skipInitialRefresh.current) {
      skipInitialRefresh.current = false;
      return;
    }
    setLoading(true);
    setError(null);
    const offset = (page - 1) * PAGE_SIZE;
    fetch(`${API_CONFIG.POSTGRES_API_URL}/api/rich-list?limit=${PAGE_SIZE}&offset=${offset}`)
      .then(r => r.json())
      .then(data => {
        if (!data.success) throw new Error(data.error || 'Failed to fetch');
        setAddresses(data.addresses);
        setConcentration(data.concentration);
        setPagination(data.pagination);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, [page]);

  const labeledCount = addresses.filter(a => a.label).length;

  // Columns close over zecPrice/concentration state for USD values and share %.
  const richListColumns: DataTableColumn<RichListEntry>[] = [
    {
      id: 'rank',
      header: '#',
      className: 'w-12',
      skeletonWidth: 'w-6',
      cell: (entry) => <span className="text-muted font-mono text-xs">{entry.rank}</span>,
    },
    {
      id: 'address',
      header: 'Address',
      skeletonWidth: 'w-28',
      cell: (entry) => (
        <div className="flex flex-col">
          <HashLink value={entry.address} href={`/address/${entry.address}`} lead={8} tail={8} />
          {/* Show label inline on mobile where label column is hidden */}
          {entry.label && (
            <span className="text-[10px] text-muted md:hidden mt-0.5 flex items-center gap-1">
              {entry.logoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={entry.logoUrl} alt="" width={12} height={12} className="rounded-sm" />
              )}
              {entry.label}
            </span>
          )}
        </div>
      ),
    },
    {
      id: 'label',
      header: 'Label',
      className: 'hidden md:table-cell',
      cell: (entry) => entry.label ? (
        <div className="flex items-center gap-2">
          {entry.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={entry.logoUrl} alt="" width={16} height={16} className="rounded-sm flex-shrink-0" />
          )}
          <span className="text-xs text-primary truncate max-w-[120px]">{entry.label}</span>
          {entry.category && (
            <Badge color={categoryColor(entry.category)}>{entry.category}</Badge>
          )}
        </div>
      ) : (
        <span className="text-xs text-muted italic">&mdash;</span>
      ),
    },
    {
      id: 'balance',
      header: 'Balance',
      align: 'right',
      skeletonWidth: 'w-24',
      cell: (entry) => (
        <>
          <div className="font-mono text-sm text-primary font-bold">
            {entry.balance >= 1000 ? formatZec(entry.balance) : entry.balance.toFixed(2)} ZEC
          </div>
          {zecPrice && (
            <div className="text-[10px] text-muted font-mono">
              ${(entry.balance * zecPrice).toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </div>
          )}
        </>
      ),
    },
    {
      id: 'share',
      header: '% Transparent',
      align: 'right',
      className: 'hidden sm:table-cell',
      skeletonWidth: 'w-12',
      cell: (entry) => (
        <span className="font-mono text-xs text-secondary">
          {concentration && concentration.totalTransparent > 0
            ? ((entry.balance / concentration.totalTransparent) * 100).toFixed(2)
            : '—'}%
        </span>
      ),
    },
    {
      id: 'txs',
      header: 'Txs',
      align: 'right',
      className: 'hidden lg:table-cell',
      skeletonWidth: 'w-12',
      cell: (entry) => (
        <span className="font-mono text-xs text-secondary">{entry.txCount.toLocaleString()}</span>
      ),
    },
  ];

  if (error && !addresses.length) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <Card className="text-center">
          <CardBody className="py-16">
            <div className="text-5xl mb-6">&#x26A0;&#xFE0F;</div>
            <h2 className="text-xl font-bold text-primary mb-3">Rich List Unavailable</h2>
            <p className="text-secondary mb-6">{error}</p>
            <button
              onClick={() => { setError(null); setPage(1); }}
              className="px-6 py-2 bg-cipher-cyan text-cipher-bg font-semibold rounded-lg hover:bg-cipher-yellow transition-colors"
            >
              Retry
            </button>
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      <PageHeader
        eyebrow="RICH_LIST"
        title="Top Addresses"
        actions={
          pagination ? (
            <span className="text-xs text-muted font-mono">
              {pagination.total.toLocaleString()} addresses with balance
            </span>
          ) : undefined
        }
      />

      {/* Concentration Summary Cards */}
      {concentration && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6 animate-fade-in-up stagger-2">
          <Card variant="compact">
            <CardBody>
              <div className="text-[10px] sm:text-xs text-muted font-mono uppercase tracking-wider mb-1">
                Top 10 Concentration
              </div>
              <div className="text-2xl font-bold text-primary font-mono">
                {concentration.top10Pct.toFixed(1)}%
              </div>
              <div className="text-[10px] text-muted mt-0.5">
                {formatZec(concentration.top10)} of {formatZec(concentration.totalTransparent)} transparent ZEC
              </div>
            </CardBody>
          </Card>

          <Card variant="compact">
            <CardBody>
              <div className="text-[10px] sm:text-xs text-muted font-mono uppercase tracking-wider mb-1">
                Top 100 Concentration
              </div>
              <div className="text-2xl font-bold text-primary font-mono">
                {concentration.top100Pct.toFixed(1)}%
              </div>
              <div className="text-[10px] text-muted mt-0.5">
                {formatZec(concentration.top100)} of {formatZec(concentration.totalTransparent)} transparent ZEC
              </div>
            </CardBody>
          </Card>

          <Card variant="compact">
            <CardBody>
              <div className="text-[10px] sm:text-xs text-muted font-mono uppercase tracking-wider mb-1">
                Transparent Supply
              </div>
              <div className="text-2xl font-bold text-primary font-mono">
                {formatZec(concentration.totalTransparent)} ZEC
              </div>
              <div className="text-xs text-muted mt-0.5">
                {labeledCount > 0 && (
                  <Badge color="cyan">{labeledCount} labeled</Badge>
                )}
              </div>
            </CardBody>
          </Card>
        </div>
      )}

      {/* Table */}
      <DataTable
        className="animate-fade-in-up stagger-3"
        columns={richListColumns}
        rows={addresses}
        rowKey={(entry) => entry.address}
        loading={loading}
      />

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <Pagination
          page={pagination.page}
          totalPages={pagination.totalPages}
          hasNext={pagination.hasNext}
          hasPrev={pagination.hasPrev}
          onFirst={() => setPage(1)}
          onPrev={() => setPage(p => Math.max(1, p - 1))}
          onNext={() => setPage(p => p + 1)}
          loading={loading}
        />
      )}

      {/* Note */}
      <div className="mt-8 text-center animate-fade-in-up stagger-4">
        <p className="text-[11px] text-muted font-mono">
          Transparent addresses only &middot; Shielded balances are private by design
        </p>
      </div>
    </div>
  );
}
