'use client';

import { ReactNode } from 'react';

export type BadgeColor = 'cyan' | 'purple' | 'green' | 'orange' | 'amber' | 'danger' | 'muted';

interface BadgeProps {
  children: ReactNode;
  color?: BadgeColor;
  icon?: ReactNode;
  className?: string;
  /**
   * 'solid' (default): fully-tinted background + colored text — the only
   * way to scan a color-coded column (Type/Pool) at a glance with no icon.
   * 'subtle': neutral chip, color lives only in the icon. Use this whenever
   * several badges sit in one row together (e.g. a tx-detail header strip)
   * so the row reads as one calm unit instead of one saturated fill per
   * badge — icon color still carries the same meaning, just quieter.
   */
  variant?: 'solid' | 'subtle';
}

/**
 * Badge Component
 *
 * Small status indicators with semantic colors.
 *
 * Colors:
 * - cyan: Information, links, highlights
 * - purple: Shielded, privacy-related
 * - green: Success, confirmed
 * - orange: Warning, attention
 * - muted: Neutral, inactive
 */
export function Badge({
  children,
  color = 'cyan',
  icon,
  className = '',
  variant = 'solid',
}: BadgeProps) {
  const colorClasses: Record<BadgeColor, string> = {
    cyan: 'badge-cyan',
    purple: 'badge-purple',
    green: 'badge-green',
    orange: 'badge-orange',
    amber: 'badge-amber',
    danger: 'badge-danger',
    muted: 'badge-muted',
  };

  return (
    <span className={`badge ${variant === 'subtle' ? 'badge-subtle' : ''} ${colorClasses[color]} ${className}`}>
      {icon && <span className="badge-icon">{icon}</span>}
      <span className="badge-text">{children}</span>
    </span>
  );
}

/**
 * StatusBadge Component
 *
 * Pre-configured badges for common statuses.
 */
interface StatusBadgeProps {
  status: 'confirmed' | 'pending' | 'reorganized' | 'shielded' | 'transparent' | 'warning';
  className?: string;
  variant?: 'solid' | 'subtle';
}

export function StatusBadge({ status, className = '', variant = 'solid' }: StatusBadgeProps) {
  const configs: Record<string, { label: string; color: BadgeColor; icon?: ReactNode }> = {
    confirmed: {
      label: 'CONFIRMED',
      color: 'green',
      icon: (
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      ),
    },
    reorganized: {
      label: 'REORGANIZED',
      color: 'orange',
      icon: (
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
      ),
    },
    pending: {
      label: 'PENDING',
      color: 'orange',
      icon: (
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    shielded: {
      label: 'SHIELDED',
      color: 'purple',
      icon: (
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      ),
    },
    transparent: {
      label: 'TRANSPARENT',
      color: 'muted',
    },
    warning: {
      label: 'WARNING',
      color: 'orange',
      icon: (
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      ),
    },
  };

  const config = configs[status];

  return (
    <Badge color={config.color} icon={config.icon} className={className} variant={variant}>
      {config.label}
    </Badge>
  );
}

/**
 * CountBadge Component
 *
 * Numeric badge for counts.
 */
interface CountBadgeProps {
  count: number;
  color?: BadgeColor;
  className?: string;
}

export function CountBadge({ count, color = 'cyan', className = '' }: CountBadgeProps) {
  return (
    <Badge color={color} className={`badge-count ${className}`}>
      {count}
    </Badge>
  );
}
