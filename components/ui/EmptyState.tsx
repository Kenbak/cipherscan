import { Skeleton } from './Skeleton';
import { ReactNode } from 'react';

/**
 * EmptyState — the standard "nothing here" panel.
 *
 * Use inside cards and tables for empty results, scan-in-progress, and
 * error placeholders so the treatment is identical app-wide. For full-page
 * missing resources use the route's not-found handling instead.
 */
export function EmptyState({
  title,
  description,
  icon,
  action,
  className = '',
}: {
  title: string;
  description?: ReactNode;
  /** Emoji string or an SVG node */
  icon?: ReactNode;
  /** Optional call-to-action (link or button) */
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`text-center py-12 ${className}`}>
      {icon && <div className="text-4xl mb-4">{icon}</div>}
      <p className="text-sm font-mono text-secondary">{title}</p>
      {description && (
        <p className="text-xs text-muted mt-2 max-w-md mx-auto">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Column-aware loading table; the caller owns card chrome and pagination. */
export function SkeletonTable({ rows = 10, rowHeight = 'h-[44px]', className = '', label = 'Loading…', columns = 4, headers, columnClasses = [], footer = false }: {
  rows?: number; rowHeight?: string; className?: string; label?: string | null;
  columns?: number; headers?: string[]; columnClasses?: string[]; footer?: boolean;
}) {
  const count = headers?.length ?? columns;
  return <div className={`overflow-x-auto ${className}`} aria-busy="true">
    {label !== null && <span role="status" className="sr-only">{label}</span>}
    <table className="w-full" aria-hidden="true"><thead><tr>{Array.from({ length: count }, (_, i) => <th key={i} className={`px-4 py-3.5 border-b border-cipher-border text-caption font-semibold uppercase text-muted ${i === 0 ? 'text-left' : 'text-right'} ${columnClasses[i] ?? ''}`}>
      {headers?.[i] ?? <Skeleton className={`h-4 w-16 ${i ? 'ml-auto' : ''}`} />}
    </th>)}</tr></thead><tbody>{Array.from({ length: rows }, (_, row) => <tr key={row}>{Array.from({ length: count }, (_, col) => <td key={col} className={`px-4 ${rowHeight} border-b border-cipher-border ${columnClasses[col] ?? ''}`}><Skeleton className={`h-4 ${col === 0 ? 'w-28' : 'w-16 ml-auto'}`} /></td>)}</tr>)}</tbody></table>
    {footer && <div className="h-[52px] flex items-center justify-center" aria-hidden="true"><Skeleton className="h-4 w-20" /></div>}
  </div>;
}
