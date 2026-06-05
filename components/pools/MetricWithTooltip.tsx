'use client';

import { ReactNode } from 'react';
import { Tooltip } from '@/components/Tooltip';

interface MetricWithTooltipProps {
  label: string;
  tooltip: string;
  children: ReactNode;
  className?: string;
}

export function MetricWithTooltip({ label, tooltip, children, className = '' }: MetricWithTooltipProps) {
  return (
    <div className={className}>
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-[10px] font-mono uppercase tracking-wider text-muted">{label}</span>
        <Tooltip content={tooltip} />
      </div>
      {children}
    </div>
  );
}
