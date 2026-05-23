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
  watermarkSize?: WatermarkSize;
}

export function ChartCard({
  title,
  children,
  controls,
  className = '',
  height = 320,
  watermarkSize = 'md',
}: ChartCardProps) {
  return (
    <Card className={className}>
      <CardBody>
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted font-mono uppercase tracking-widest opacity-50">{'>'}</span>
            <h2 className="text-sm font-bold font-mono text-secondary uppercase tracking-wider">{title}</h2>
          </div>
          {controls}
        </div>
        <div className="relative overflow-hidden rounded-lg" style={{ minHeight: height }}>
          <ChartWatermark size={watermarkSize} />
          <div className="relative z-[1]">{children}</div>
        </div>
      </CardBody>
    </Card>
  );
}
