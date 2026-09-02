'use client';

import { ReactNode } from 'react';
import { Card, CardBody } from '@/components/ui/Card';
import { ChartWatermark, WatermarkSize } from '@/components/ChartWatermark';

interface ChartCardProps {
  title: string;
  children: ReactNode;
  controls?: ReactNode;
  className?: string;
  height?: number;
  /** When true, the card stretches to fill its parent (e.g. a grid row) and the chart area grows to use all remaining space. */
  fill?: boolean;
  watermarkSize?: WatermarkSize;
}

export function ChartCard({
  title,
  children,
  controls,
  className = '',
  height = 320,
  fill = false,
  watermarkSize = 'md',
}: ChartCardProps) {
  return (
    <Card className={`${fill ? 'h-full' : ''} ${className}`}>
      <CardBody className={fill ? 'h-full flex flex-col' : undefined}>
        <div className="flex items-start sm:items-center justify-between gap-2 sm:gap-3 mb-4 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs text-muted font-mono uppercase tracking-widest opacity-50">{'>'}</span>
            <h2 className="text-xs sm:text-sm font-bold font-mono text-secondary uppercase tracking-wider truncate">{title}</h2>
          </div>
          {controls}
        </div>
        <div className={`relative rounded-lg ${fill ? 'flex-1 min-h-0' : ''}`} style={fill ? undefined : { minHeight: height }}>
          <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-lg">
            <ChartWatermark size={watermarkSize} />
          </div>
          <div className={`relative z-[1] px-0.5 pb-1 ${fill ? 'h-full' : ''}`}>{children}</div>
        </div>
      </CardBody>
    </Card>
  );
}
