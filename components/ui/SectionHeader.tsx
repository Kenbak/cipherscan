import { ReactNode } from 'react';

/**
 * PageHeader — the standard page-level header.
 *
 * Renders the `> EYEBROW` mono label, the page H1, and an optional subtitle.
 * Use on every top-level page so titles stay visually identical app-wide.
 *
 * Do not hand-roll this pattern in pages; if a page needs an extra control
 * next to the title, pass it via `actions`.
 */
export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
  className = '',
}: {
  /** Mono uppercase label, e.g. "MINING" — rendered as "> MINING" */
  eyebrow: string;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Optional right-aligned controls (export button, period selector, ...) */
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`mb-8 animate-fade-in ${className}`}>
      <p className="text-xs text-muted font-mono uppercase tracking-widest mb-3">
        <span className="opacity-50">{'>'}</span> {eyebrow}
      </p>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold text-primary font-sans">{title}</h1>
          {subtitle && (
            <p className="text-sm text-secondary mt-2 max-w-2xl font-sans">{subtitle}</p>
          )}
        </div>
        {actions && <div className="shrink-0">{actions}</div>}
      </div>
    </div>
  );
}

/**
 * SectionHeader — the standard in-page section header.
 *
 * Renders `> LABEL` in mono with an optional live-pulse dot and a right-side
 * actions slot (filters, period pills, icon buttons). Matches the pattern
 * used on /mining, /pools, /mempool.
 */
export function SectionHeader({
  label,
  live = false,
  actions,
  className = '',
}: {
  /** Mono uppercase section label, e.g. "POOL_RANKING" */
  label: string;
  /** Show a green pulsing dot after the label (live data sections) */
  live?: boolean;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex items-start sm:items-center justify-between gap-2 mb-4 flex-wrap ${className}`}>
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted font-mono uppercase tracking-widest opacity-50">{'>'}</span>
        <h2 className="text-xs sm:text-sm font-bold font-mono text-secondary uppercase tracking-wider">
          {label}
        </h2>
        {live && (
          <span className="relative flex h-2 w-2" aria-label="Live">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cipher-green opacity-60" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-cipher-green" />
          </span>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
