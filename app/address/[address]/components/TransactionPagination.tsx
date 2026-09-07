'use client';

import Link from 'next/link';

export function TransactionPagination({ address, currentPage, totalPages, pageSize, totalTxCount }: {
  address: string; currentPage: number; totalPages: number; pageSize: number; totalTxCount: number;
}) {
  if (totalPages <= 1) return null;
  const href = (page: number) => `/address/${address}${page > 1 ? `?page=${page}` : ''}`;
  const style = 'rounded border border-cipher-border px-3 py-2 text-xs font-mono text-secondary hover:bg-cipher-hover hover:text-primary';
  return <nav aria-label="Transaction pagination" className="flex flex-wrap items-center justify-between gap-3 py-2">
    <p className="text-xs text-muted">{((currentPage - 1) * pageSize + 1).toLocaleString('en-US')}–{Math.min(currentPage * pageSize, totalTxCount).toLocaleString('en-US')} of {totalTxCount.toLocaleString('en-US')} transactions</p>
    <div className="flex flex-wrap items-center gap-2">
      {currentPage > 1 && <><Link href={href(1)} className={style} aria-label="First page">First</Link><Link href={href(currentPage - 1)} className={style} aria-label="Previous page">← Previous</Link></>}
      <span className="px-2 text-xs font-mono text-muted">{currentPage} / {totalPages}</span>
      {currentPage < totalPages && <><Link href={href(currentPage + 1)} className={style} aria-label="Next page">Next →</Link><Link href={href(totalPages)} className={style} aria-label="Last page">Last</Link></>}
    </div>
  </nav>;
}
