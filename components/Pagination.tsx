'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

interface PaginationProps {
  page: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
  onFirst?: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  firstHref?: string;
  prevHref?: string;
  nextHref?: string;
  loading?: boolean;
}

interface PaginationControlProps {
  children: ReactNode;
  disabled: boolean;
  href?: string;
  onClick?: () => void;
  className: string;
}

function PaginationControl({
  children,
  disabled,
  href,
  onClick,
  className,
}: PaginationControlProps) {
  if (disabled) {
    return (
      <span aria-disabled="true" className={`${className} opacity-20 cursor-not-allowed`}>
        {children}
      </span>
    );
  }

  if (href) {
    return (
      <Link href={href} className={className}>
        {children}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} className={className}>
      {children}
    </button>
  );
}

export function Pagination({
  page,
  totalPages,
  hasNext,
  hasPrev,
  onFirst,
  onPrev,
  onNext,
  firstHref,
  prevHref,
  nextHref,
  loading = false,
}: PaginationProps) {
  const firstClassName = 'px-3 py-1.5 text-xs font-mono text-muted hover:text-primary transition-colors';
  const pageClassName = 'px-3 py-1.5 text-xs font-mono text-secondary border border-cipher-border rounded hover:text-primary hover:border-[var(--color-text-muted)] transition-colors';

  return (
    <nav aria-label="Pagination" className="flex items-center justify-center gap-3 mt-6">
      <PaginationControl
        onClick={onFirst}
        href={firstHref}
        disabled={!hasPrev || loading}
        className={firstClassName}
      >
        First
      </PaginationControl>
      <PaginationControl
        onClick={onPrev}
        href={prevHref}
        disabled={!hasPrev || loading}
        className={pageClassName}
      >
        Prev
      </PaginationControl>
      <span className="text-xs font-mono text-secondary px-2">
        Page {page.toLocaleString()}{totalPages > 0 && <span className="text-muted"> / {totalPages.toLocaleString()}</span>}
      </span>
      <PaginationControl
        onClick={onNext}
        href={nextHref}
        disabled={!hasNext || loading}
        className={pageClassName}
      >
        Next
      </PaginationControl>
    </nav>
  );
}
