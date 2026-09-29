'use client';

import type { MouseEvent, ReactNode } from 'react';
import type { AddressPaginationState } from './types';

function PageLink({ href, label, children }: { href: string; label: string; children: ReactNode }) {
  function navigate(event: MouseEvent<HTMLAnchorElement>) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    window.history.pushState(null, '', href);
  }
  return <a href={href} onClick={navigate} aria-label={label} title={label}
    className="px-3 py-2 text-sm rounded border border-cipher-border hover:border-cipher-cyan hover:text-primary transition-colors">{children}</a>;
}

export function TransactionPagination({ address, currentPage, totalPages, pageSize, totalTxCount, pagination }: {
  address: string; currentPage: number; totalPages: number; pageSize: number; totalTxCount: number;
  pagination?: AddressPaginationState | null;
}) {
  if (totalPages <= 1) return null;
  const href = (page: number, cursor?: string | null) => {
    const query = new URLSearchParams({ page: String(page) });
    if (cursor) query.set('cursor', cursor);
    return `/address/${address}${page > 1 || cursor ? `?${query}` : ''}`;
  };
  return <nav aria-label="Transaction pagination" className="mt-6 flex flex-wrap items-center justify-between gap-4 p-4 rounded-lg border border-cipher-border">
    <div className="text-sm text-secondary">
      Page {currentPage.toLocaleString('en-US')} of {totalPages.toLocaleString('en-US')}
      <span className="text-muted ml-2">({((currentPage - 1) * pageSize + 1).toLocaleString('en-US')}–{Math.min(currentPage * pageSize, totalTxCount).toLocaleString('en-US')} of {totalTxCount.toLocaleString('en-US')} txns)</span>
      {pagination?.snapshotHeight != null && <p className="text-xs text-muted mt-1">History through block {pagination.snapshotHeight.toLocaleString('en-US')}. <a href={`/address/${address}`} className="underline">Refresh latest</a></p>}
    </div>
    <div className="flex flex-wrap items-center gap-2">
      {currentPage > 1 && <><PageLink href={href(1)} label="First page">First</PageLink><PageLink href={href(currentPage - 1, pagination?.prevCursor)} label="Previous page">← Previous</PageLink></>}
      {currentPage < totalPages && <><PageLink href={href(currentPage + 1, pagination?.nextCursor)} label="Next page">Next →</PageLink><PageLink href={href(totalPages, pagination?.lastCursor)} label="Last page">Last</PageLink></>}
    </div>
  </nav>;
}
