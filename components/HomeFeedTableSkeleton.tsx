import type { ReactNode } from 'react';

/** Match the feed's column header, 48px rows and optional footer while loading. */
export function HomeFeedTableSkeleton({ rows = 5, footer }: { rows?: number; footer?: ReactNode }) {
  return (
    <div className="card p-0 overflow-hidden" aria-busy="true">
      <span className="sr-only" role="status">Loading activity</span>
      <div aria-hidden="true">
        <div className="px-4 sm:px-5 py-3.5 border-b border-cipher-border">
          <div className="h-4 w-48 max-w-full rounded skeleton-bg motion-safe:animate-pulse" />
        </div>
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="h-12 px-4 sm:px-5 border-b border-cipher-border flex items-center justify-between gap-4">
            <div className="h-4 w-28 rounded skeleton-bg motion-safe:animate-pulse" />
            <div className="h-4 w-12 rounded skeleton-bg motion-safe:animate-pulse" />
            <div className="h-4 w-16 rounded skeleton-bg motion-safe:animate-pulse" />
          </div>
        ))}
      </div>
      {footer && <div className="px-4 py-3 border-t border-cipher-border flex items-center justify-center text-center">{footer}</div>}
    </div>
  );
}
