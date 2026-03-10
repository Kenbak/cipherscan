'use client';

interface PaginationProps {
  page: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
  onFirst: () => void;
  onPrev: () => void;
  onNext: () => void;
  loading?: boolean;
}

export function Pagination({ page, totalPages, hasNext, hasPrev, onFirst, onPrev, onNext, loading }: PaginationProps) {
  return (
    <div className="flex items-center justify-center gap-3 mt-6">
      <button
        onClick={onFirst}
        disabled={!hasPrev || loading}
        className="px-3 py-1.5 text-xs font-mono text-muted hover:text-primary transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
      >
        First
      </button>
      <button
        onClick={onPrev}
        disabled={!hasPrev || loading}
        className="px-3 py-1.5 text-xs font-mono text-secondary border border-cipher-border rounded hover:text-primary hover:border-[var(--color-text-muted)] transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
      >
        Prev
      </button>
      <span className="text-xs font-mono text-secondary px-2">
        Page {page.toLocaleString()}{totalPages > 0 && <span className="text-muted"> / {totalPages.toLocaleString()}</span>}
      </span>
      <button
        onClick={onNext}
        disabled={!hasNext || loading}
        className="px-3 py-1.5 text-xs font-mono text-secondary border border-cipher-border rounded hover:text-primary hover:border-[var(--color-text-muted)] transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
      >
        Next
      </button>
    </div>
  );
}
