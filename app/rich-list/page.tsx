'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { API_CONFIG } from '@/lib/api-config';
import { Card, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Pagination } from '@/components/Pagination';

const PAGE_SIZE = 100;

interface RichListEntry {
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

interface Concentration {
  top10: number;
  top100: number;
  totalTransparent: number;
  top10Pct: number;
  top100Pct: number;
}

interface PaginationData {
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

function truncateAddress(addr: string) {
  if (addr.length <= 16) return addr;
  return `${addr.slice(0, 8)}...${addr.slice(-8)}`;
}

function formatZec(amount: number): string {
  if (amount >= 1e6) return `${(amount / 1e6).toFixed(2)}M`;
  if (amount >= 1e3) return `${(amount / 1e3).toFixed(1)}K`;
  return amount.toFixed(2);
}

export default function RichListPage() {
  const [addresses, setAddresses] = useState<RichListEntry[]>([]);
  const [concentration, setConcentration] = useState<Concentration | null>(null);
  const [pagination, setPagination] = useState<PaginationData | null>(null);
  const [loading, setLoading] = useState(true);
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
      {/* Header */}
      <div className="mb-8 animate-fade-in">
        <p className="text-xs text-muted font-mono uppercase tracking-widest mb-3">
          <span className="opacity-50">{'>'}</span> RICH_LIST
        </p>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <h1 className="text-2xl sm:text-3xl font-bold text-primary">
            Top Addresses
          </h1>
          {pagination && (
            <span className="text-xs text-muted font-mono">
              {pagination.total.toLocaleString()} addresses with balance
            </span>
          )}
        </div>
      </div>

      {/* Concentration Summary Cards */}
      {concentration && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6 animate-fade-in-up" style={{ animationDelay: '50ms' }}>
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
      <div className="card p-0 overflow-hidden animate-fade-in-up" style={{ animationDelay: '100ms' }}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted border-b border-cipher-border w-12">#</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted border-b border-cipher-border">Address</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted border-b border-cipher-border hidden md:table-cell">Label</th>
                <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-muted border-b border-cipher-border">Balance</th>
                <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-muted border-b border-cipher-border hidden sm:table-cell">% Transparent</th>
                <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-muted border-b border-cipher-border hidden lg:table-cell">Txs</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 15 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-4 py-3.5 border-b border-cipher-border"><div className="h-4 w-6 bg-cipher-border rounded" /></td>
                    <td className="px-4 py-3.5 border-b border-cipher-border"><div className="h-4 w-28 bg-cipher-border rounded" /></td>
                    <td className="px-4 py-3.5 border-b border-cipher-border hidden md:table-cell"><div className="h-4 w-20 bg-cipher-border rounded" /></td>
                    <td className="px-4 py-3.5 border-b border-cipher-border text-right"><div className="h-4 w-24 bg-cipher-border rounded ml-auto" /></td>
                    <td className="px-4 py-3.5 border-b border-cipher-border text-right hidden sm:table-cell"><div className="h-4 w-12 bg-cipher-border rounded ml-auto" /></td>
                    <td className="px-4 py-3.5 border-b border-cipher-border text-right hidden lg:table-cell"><div className="h-4 w-12 bg-cipher-border rounded ml-auto" /></td>
                  </tr>
                ))
              ) : addresses.map((entry) => (
                <tr key={entry.address} className="group transition-colors duration-100 hover:bg-[var(--color-hover)]">
                  <td className="px-4 h-[44px] border-b border-cipher-border">
                    <span className="text-muted font-mono text-xs">{entry.rank}</span>
                  </td>
                  <td className="px-4 h-[44px] border-b border-cipher-border">
                    <div className="flex flex-col">
                      <Link
                        href={`/address/${entry.address}`}
                        className="font-mono text-xs text-primary hover:text-cipher-cyan transition-colors truncate block max-w-[140px] sm:max-w-[220px]"
                      >
                        {truncateAddress(entry.address)}
                      </Link>
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
                  </td>
                  <td className="px-4 h-[44px] border-b border-cipher-border hidden md:table-cell">
                    {entry.label ? (
                      <div className="flex items-center gap-2">
                        {entry.logoUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={entry.logoUrl} alt="" width={16} height={16} className="rounded-sm flex-shrink-0" />
                        )}
                        <span className="text-xs text-primary truncate max-w-[120px]">{entry.label}</span>
                        {entry.category && (
                          <Badge color={categoryColor(entry.category)}>
                            {entry.category}
                          </Badge>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-muted italic">&mdash;</span>
                    )}
                  </td>
                  <td className="px-4 h-[44px] border-b border-cipher-border text-right">
                    <div className="font-mono text-sm text-primary font-bold">
                      {entry.balance >= 1000 ? formatZec(entry.balance) : entry.balance.toFixed(2)} ZEC
                    </div>
                    {zecPrice && (
                      <div className="text-[10px] text-muted font-mono">
                        ${(entry.balance * zecPrice).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </div>
                    )}
                  </td>
                  <td className="px-4 h-[44px] border-b border-cipher-border text-right hidden sm:table-cell">
                    <span className="font-mono text-xs text-secondary">
                      {concentration && concentration.totalTransparent > 0
                        ? ((entry.balance / concentration.totalTransparent) * 100).toFixed(2)
                        : '—'}%
                    </span>
                  </td>
                  <td className="px-4 h-[44px] border-b border-cipher-border text-right hidden lg:table-cell">
                    <span className="font-mono text-xs text-secondary">
                      {entry.txCount.toLocaleString()}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

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
      <div className="mt-8 text-center animate-fade-in-up" style={{ animationDelay: '150ms' }}>
        <p className="text-[11px] text-muted font-mono">
          Transparent addresses only &middot; Shielded balances are private by design
        </p>
      </div>
    </div>
  );
}
