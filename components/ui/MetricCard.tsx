import { ReactNode } from 'react';

/**
 * MetricCard — the standard dashboard stat tile.
 *
 * Icon + mono label + value, with an optional delta indicator and an
 * optional sparkline slot. Use for every "number in a box" so stat tiles
 * look identical on every dashboard.
 */
export function MetricCard({
  label,
  value,
  icon,
  delta,
  hint,
  sparkline,
  accent = 'default',
  size = 'default',
  className = '',
}: {
  /** Mono uppercase label, e.g. "HASHRATE" */
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  /** Percentage change; renders green when positive, red when negative */
  delta?: number | null;
  /** Small muted text under the value (e.g. "vs last 7d") */
  hint?: ReactNode;
  /** Optional tiny chart rendered at the bottom of the card */
  sparkline?: ReactNode;
  /** Value color accent */
  accent?: 'default' | 'cyan' | 'green' | 'purple' | 'yellow' | 'orange';
  /** Compact uses smaller text for list page summaries */
  size?: 'default' | 'compact';
  className?: string;
}) {
  const valueColor = {
    default: 'text-primary',
    cyan: 'text-cipher-cyan',
    green: 'text-cipher-green',
    purple: 'text-cipher-purple',
    yellow: 'text-cipher-yellow',
    orange: 'text-cipher-orange',
  }[accent];

  const valueSize = size === 'compact' ? 'text-lg sm:text-xl' : 'text-xl sm:text-2xl';

  return (
    <div className={`card card-compact card-static ${className}`}>
      <div className="flex items-center gap-1.5 mb-2">
        {icon && <span className="text-muted [&>svg]:w-3.5 [&>svg]:h-3.5">{icon}</span>}
        <span className="text-[10px] font-mono text-muted uppercase tracking-widest">{label}</span>
      </div>
      <div className="flex items-baseline gap-2 flex-wrap min-w-0">
        <span className={`${valueSize} font-bold font-mono tabular-nums whitespace-nowrap ${valueColor}`}>
          {value}
        </span>
        {typeof delta === 'number' && Number.isFinite(delta) && (
          <span
            className={`text-xs font-mono ${delta >= 0 ? 'text-cipher-green' : 'text-danger'}`}
          >
            {delta >= 0 ? '↑' : '↓'} {Math.abs(delta).toFixed(1)}%
          </span>
        )}
      </div>
      {hint && <div className="text-[11px] text-muted mt-1">{hint}</div>}
      {sparkline && <div className="mt-2">{sparkline}</div>}
    </div>
  );
}
