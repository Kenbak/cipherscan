import { ReactNode } from 'react';
import { Tooltip } from '@/components/Tooltip';

/**
 * InfoRow — the standard label/value row for detail pages.
 *
 * Used on block, transaction, and address detail views. Left column holds
 * an optional icon + label + optional tooltip; the right column holds the
 * value in mono. Stacks vertically on mobile.
 */
export function InfoRow({
  label,
  value,
  icon,
  tooltip,
  valueClass = 'text-primary',
  onClick,
  className = '',
}: {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  /** Optional help text shown via the shared Tooltip component */
  tooltip?: string;
  valueClass?: string;
  /** Makes the value clickable (adds pointer + cyan hover) */
  onClick?: () => void;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col sm:flex-row sm:items-start py-3 border-b border-cipher-border last:border-0 gap-2 sm:gap-0 ${className}`}
    >
      <div className="flex items-center min-w-[140px] sm:min-w-[200px] text-secondary">
        {icon && <span className="mr-2 [&>svg]:w-4 [&>svg]:h-4">{icon}</span>}
        <span className="text-xs sm:text-sm">{label}</span>
        {tooltip && (
          <span className="ml-2">
            <Tooltip content={tooltip} />
          </span>
        )}
      </div>
      <div
        className={`flex-1 font-mono text-xs sm:text-sm ${valueClass} break-all ${
          onClick ? 'cursor-pointer hover:text-cipher-cyan transition-colors' : ''
        }`}
        onClick={onClick}
      >
        {value}
      </div>
    </div>
  );
}
