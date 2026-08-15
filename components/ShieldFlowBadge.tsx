'use client';

import { Badge, IconTooltip } from '@/components/ui';
import {
  ShieldFlowIcon,
  MixedIcon,
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

const BADGE_COLOR: Record<ShieldFlowType, 'purple' | 'green' | 'orange' | 'muted' | 'amber'> = {
  shielded: 'purple',
  shielding: 'green',
  unshielding: 'orange',
  mixed: 'muted',
  migration: 'amber',
};

export function ShieldFlowBadge({ type, variant = 'compact', className = '' }: ShieldFlowBadgeProps) {
  const label = SHIELD_FLOW_LABELS[type];

  if (type === 'mixed' && variant === 'compact') {
    return (
      <IconTooltip label={label} className={`text-muted ${className}`}>
        <MixedIcon size={18} />
      </IconTooltip>
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
    <IconTooltip label={label} className={`${SHIELD_FLOW_COLORS[type]} ${className}`}>
      {icon}
    </IconTooltip>
  );
}

/** Inline legend for table footers — teaches icon meanings once. */
export function ShieldFlowLegend({ className = '' }: { className?: string }) {
  const items: ShieldFlowType[] = ['shielding', 'unshielding', 'shielded', 'migration', 'mixed'];

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
