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

/**
 * SkeletonTable — the standard table loading state.
 *
 * Renders `rows` pulsing placeholder bars. Matches the row height of the
 * standard data table (44px) so content does not jump when data arrives.
 *
 * The pulsing bars themselves stay `aria-hidden` (decorative, no useful
 * structure for assistive tech), but a paired `sr-only` `role="status"`
 * region announces the loading state — every existing call site gets this
 * for free without needing to add its own wrapper.
 */
export function SkeletonTable({
  rows = 10,
  rowHeight = 'h-[44px]',
  className = '',
  label = 'Loading…',
}: {
  rows?: number;
  rowHeight?: string;
  className?: string;
  /** Screen-reader status text. Pass `null` to suppress the live region
   * (e.g. when a parent component already announces loading state itself). */
  label?: string | null;
}) {
  return (
    <div className={className}>
      {label !== null && (
        <span role="status" aria-live="polite" className="sr-only">{label}</span>
      )}
      <div className="space-y-1.5" aria-hidden="true">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className={`${rowHeight} skeleton-bg rounded animate-pulse`} />
        ))}
      </div>
    </div>
  );
}
