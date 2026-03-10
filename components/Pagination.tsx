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
  const btnBase = 'px-3 py-1.5 text-xs font-mono rounded-lg border transition-colors disabled:opacity-30 disabled:cursor-not-allowed';
  const btnDefault = `${btnBase} border-cipher-border text-secondary hover:border-cipher-cyan hover:text-primary bg-glass-2`;
  const btnActive = `${btnBase} border-cipher-cyan/50 text-primary bg-cipher-cyan/10`;

  return (
    <div className="flex items-center justify-center gap-2 mt-6">
      <button onClick={onFirst} disabled={!hasPrev || loading} className={btnDefault}>
        First
      </button>
      <button onClick={onPrev} disabled={!hasPrev || loading} className={btnDefault}>
        ← Prev
      </button>
      <span className={btnActive}>
        Page {page.toLocaleString()}{totalPages > 0 && <span className="text-muted"> / {totalPages.toLocaleString()}</span>}
      </span>
      <button onClick={onNext} disabled={!hasNext || loading} className={btnDefault}>
        Next →
      </button>
    </div>
  );
}
