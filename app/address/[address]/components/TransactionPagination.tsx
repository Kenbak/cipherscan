'use client';

import Link from 'next/link';

interface TransactionPaginationProps {
  address: string;
  currentPage: number;
  totalPages: number;
  pageSize: number;
  totalTxCount: number;
}

export function TransactionPagination({
  address,
  currentPage,
  totalPages,
  pageSize,
  totalTxCount,
}: TransactionPaginationProps) {
  if (totalPages <= 1) return null;

  const pages: (number | string)[] = [];
  const maxVisible = 5;

  if (totalPages <= maxVisible + 2) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    let start = Math.max(2, currentPage - 1);
    let end = Math.min(totalPages - 1, currentPage + 1);
    if (currentPage <= 3) {
      end = Math.min(4, totalPages - 1);
    } else if (currentPage >= totalPages - 2) {
      start = Math.max(2, totalPages - 3);
    }
    if (start > 2) pages.push('...');
    for (let i = start; i <= end; i++) pages.push(i);
    if (end < totalPages - 1) pages.push('...');
    pages.push(totalPages);
  }

  return (
    <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4 p-4 tx-summary-box rounded-lg border border-cipher-border">
      <div className="text-sm text-secondary">
        Page <span className="font-semibold text-primary">{currentPage}</span> of{' '}
        <span className="font-semibold text-primary">{totalPages}</span>
        <span className="text-muted ml-2">
          ({((currentPage - 1) * pageSize) + 1}-{Math.min(currentPage * pageSize, totalTxCount)} of {totalTxCount} txns)
        </span>
      </div>

      <div className="flex items-center gap-1">
        {currentPage > 1 ? (
          <Link
            href={`/address/${address}`}
            className="px-3 py-1.5 text-sm rounded border border-cipher-border hover:border-cipher-cyan hover:text-primary transition-colors"
            title="First page"
          >
            ««
          </Link>
        ) : (
          <span className="px-3 py-1.5 text-sm rounded border border-cipher-border opacity-30 cursor-not-allowed">««</span>
        )}

        {currentPage > 1 ? (
          <Link
            href={currentPage === 2 ? `/address/${address}` : `/address/${address}?page=${currentPage - 1}`}
            className="px-3 py-1.5 text-sm rounded border border-cipher-border hover:border-cipher-cyan hover:text-primary transition-colors"
            title="Previous page"
          >
            «
          </Link>
        ) : (
          <span className="px-3 py-1.5 text-sm rounded border border-cipher-border opacity-30 cursor-not-allowed">«</span>
        )}

        <div className="flex items-center gap-1 mx-2">
          {pages.map((p, idx) => (
            typeof p === 'number' ? (
              p === currentPage ? (
                <span
                  key={idx}
                  className="btn btn-primary btn-sm"
                >
                  {p}
                </span>
              ) : (
                <Link
                  key={idx}
                  href={p === 1 ? `/address/${address}` : `/address/${address}?page=${p}`}
                  className="px-3 py-1.5 text-sm rounded border border-cipher-border hover:border-cipher-cyan hover:text-primary transition-colors"
                >
                  {p}
                </Link>
              )
            ) : (
              <span key={idx} className="px-2 text-muted">...</span>
            )
          ))}
        </div>

        {currentPage < totalPages ? (
          <Link
            href={`/address/${address}?page=${currentPage + 1}`}
            className="px-3 py-1.5 text-sm rounded border border-cipher-border hover:border-cipher-cyan hover:text-primary transition-colors"
            title="Next page"
          >
            »
          </Link>
        ) : (
          <span className="px-3 py-1.5 text-sm rounded border border-cipher-border opacity-30 cursor-not-allowed">»</span>
        )}

        {currentPage < totalPages ? (
          <Link
            href={`/address/${address}?page=${totalPages}`}
            className="px-3 py-1.5 text-sm rounded border border-cipher-border hover:border-cipher-cyan hover:text-primary transition-colors"
            title="Last page"
          >
            »»
          </Link>
        ) : (
          <span className="px-3 py-1.5 text-sm rounded border border-cipher-border opacity-30 cursor-not-allowed">»»</span>
        )}
      </div>
    </div>
  );
}
