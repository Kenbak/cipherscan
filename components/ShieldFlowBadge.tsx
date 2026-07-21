'use client';

import { Badge } from '@/components/ui';
import {
  ShieldFlowIcon,
  SHIELD_FLOW_COLORS,
  SHIELD_FLOW_LABELS,
  type ShieldFlowType,
} from '@/components/icons/shield-flow';

interface ShieldFlowBadgeProps {
  type: ShieldFlowType;
  /** compact = icon only (tables); full = icon + label (detail views) */
  variant?: 'compact' | 'full';
  className?: string;
}

const BADGE_COLOR: Record<ShieldFlowType, 'purple' | 'green' | 'orange' | 'muted'> = {
  shielded: 'purple',
  shielding: 'green',
  unshielding: 'orange',
  mixed: 'muted',
};

export function ShieldFlowBadge({ type, variant = 'compact', className = '' }: ShieldFlowBadgeProps) {
  const label = SHIELD_FLOW_LABELS[type];

  if (type === 'mixed' && variant === 'compact') {
    return (
      <span
        className={`inline-flex text-[10px] font-mono uppercase tracking-wide text-muted ${className}`}
        title={label}
        aria-label={label}
      >
        Mixed
      </span>
    );
  }

  const icon = <ShieldFlowIcon type={type} size={variant === 'compact' ? 20 : 14} />;

  if (variant === 'full') {
    return (
      <Badge color={BADGE_COLOR[type]} icon={icon} className={className}>
        {label.toUpperCase()}
      </Badge>
    );
  }

  return (
    <span
      className={`inline-flex items-center justify-center ${SHIELD_FLOW_COLORS[type]} ${className}`}
      title={label}
      aria-label={label}
      role="img"
    >
      {icon}
    </span>
  );
}

/** Inline legend for table footers — teaches icon meanings once. */
export function ShieldFlowLegend({ className = '' }: { className?: string }) {
  const items: ShieldFlowType[] = ['shielding', 'unshielding', 'shielded'];

  return (
    <div
      className={`flex flex-wrap items-center justify-center gap-x-3 gap-y-1 py-2 text-[10px] font-mono text-muted/60 ${className}`}
    >
      {items.map((type) => (
        <span key={type} className="inline-flex items-center gap-1.5">
          <ShieldFlowIcon type={type} size={14} />
          <span>{SHIELD_FLOW_LABELS[type]}</span>
        </span>
      ))}
    </div>
  );
}
