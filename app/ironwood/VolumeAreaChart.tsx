'use client';

import { useMemo, useState, useCallback, useRef } from 'react';
import { scaleLinear } from '@visx/scale';
import { AxisLeft, AxisBottom } from '@visx/axis';
import { GridRows } from '@visx/grid';
import { Group } from '@visx/group';
import { AreaStack } from '@visx/shape';
import { curveMonotoneX } from '@visx/curve';
import { createPortal } from 'react-dom';

const GRADES = ['green', 'partial2', 'partial1', 'weak'] as const;
type Grade = (typeof GRADES)[number];

interface BucketRow {
  height: number;
  green: number;
  partial2: number;
  partial1: number;
  weak: number;
}

export interface VolumeAreaChartProps {
  data: {
    height: number;
    amountZec: number;
    grade: Grade;
  }[];
  width: number;
  height: number;
  colors: { axis: string; gridStroke: string };
  privacyColors: { best: string; denomPadded: string; distinctUnpadded: string; worst: string };
}

const GRADE_COLOR_MAP: Record<Grade, keyof VolumeAreaChartProps['privacyColors']> = {
  green: 'best',
  partial2: 'denomPadded',
  partial1: 'distinctUnpadded',
  weak: 'worst',
};

const GRADE_LABELS: Record<Grade, string> = {
  green: 'ZIP-318 compliant',
  partial2: 'Partial (2/3)',
  partial1: 'Partial (1/3)',
  weak: 'Weak (0/3)',
};

const margin = { top: 12, right: 12, bottom: 36, left: 52 };

export function VolumeAreaChart({ data, width, height: chartHeight, colors, privacyColors }: VolumeAreaChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; bucket: BucketRow; total: number } | null>(null);

  const innerWidth = width - margin.left - margin.right;
  const innerHeight = chartHeight - margin.top - margin.bottom;

  const buckets: BucketRow[] = useMemo(() => {
    if (data.length === 0) return [];

    const heights = data.map((d) => d.height);
    const minH = Math.min(...heights);
    const maxH = Math.max(...heights);
    const range = maxH - minH;

    const numBuckets = Math.min(Math.max(20, Math.floor(innerWidth / 14)), 60);
    const bucketSize = range > 0 ? Math.ceil(range / numBuckets) : 1;

    const map = new Map<number, BucketRow>();
    for (let i = 0; i <= numBuckets; i++) {
      const h = minH + i * bucketSize;
      map.set(h, { height: h, green: 0, partial2: 0, partial1: 0, weak: 0 });
    }

    for (const d of data) {
      const bucketIdx = Math.floor((d.height - minH) / bucketSize);
      const bucketH = minH + bucketIdx * bucketSize;
      const row = map.get(bucketH);
      if (row) row[d.grade] += d.amountZec;
    }

    return Array.from(map.values())
      .filter((b) => b.green + b.partial2 + b.partial1 + b.weak > 0)
      .sort((a, b) => a.height - b.height);
  }, [data, innerWidth]);

  const normalizedBuckets = useMemo(() => {
    return buckets.map((b) => {
      const total = b.green + b.partial2 + b.partial1 + b.weak;
      if (total === 0) return { ...b };
      return {
        height: b.height,
        green: (b.green / total) * 100,
        partial2: (b.partial2 / total) * 100,
        partial1: (b.partial1 / total) * 100,
        weak: (b.weak / total) * 100,
      };
    });
  }, [buckets]);

  const xScale = useMemo(
    () =>
      scaleLinear({
        domain: normalizedBuckets.length > 0 ? [normalizedBuckets[0].height, normalizedBuckets[normalizedBuckets.length - 1].height] : [0, 1],
        range: [0, innerWidth],
      }),
    [normalizedBuckets, innerWidth],
  );

  const yScale = useMemo(
    () =>
      scaleLinear({
        domain: [0, 100],
        range: [innerHeight, 0],
      }),
    [innerHeight],
  );

  const gradeColors = useMemo(
    () => ({
      green: privacyColors.best,
      partial2: privacyColors.denomPadded,
      partial1: privacyColors.distinctUnpadded,
      weak: privacyColors.worst,
    }),
    [privacyColors],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGRectElement>) => {
      if (buckets.length === 0) return;
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const mouseX = e.clientX - rect.left - margin.left;
      const hoveredHeight = xScale.invert(mouseX);

      let closest = buckets[0];
      let minDist = Infinity;
      for (const b of buckets) {
        const dist = Math.abs(b.height - hoveredHeight);
        if (dist < minDist) {
          minDist = dist;
          closest = b;
        }
      }
      const total = closest.green + closest.partial2 + closest.partial1 + closest.weak;
      setTooltip({ x: e.clientX, y: e.clientY, bucket: closest, total });
    },
    [buckets, xScale],
  );

  if (width < 100 || normalizedBuckets.length === 0) return null;

  return (
    <>
      <svg ref={svgRef} width={width} height={chartHeight}>
        <Group left={margin.left} top={margin.top}>
          <GridRows
            scale={yScale}
            width={innerWidth}
            stroke={colors.gridStroke}
            strokeOpacity={0.3}
            numTicks={5}
          />
          <AreaStack
            data={normalizedBuckets}
            keys={GRADES as unknown as string[]}
            x={(d) => xScale(d.data.height)}
            y0={(d) => yScale(d[0])}
            y1={(d) => yScale(d[1])}
            curve={curveMonotoneX}
          >
            {({ stacks, path }) =>
              stacks.map((stack) => (
                <path
                  key={stack.key}
                  d={path(stack) || ''}
                  fill={gradeColors[stack.key as Grade]}
                  fillOpacity={0.75}
                  stroke={gradeColors[stack.key as Grade]}
                  strokeWidth={0.5}
                />
              ))
            }
          </AreaStack>
          <AxisLeft
            scale={yScale}
            stroke={colors.axis}
            tickStroke={colors.axis}
            numTicks={5}
            tickLabelProps={() => ({
              fill: colors.axis,
              fontSize: 9,
              fontFamily: 'monospace',
              textAnchor: 'end' as const,
              dx: -4,
              dy: 3,
            })}
            tickFormat={(v) => `${Number(v)}%`}
            hideTicks
          />
          <AxisBottom
            top={innerHeight}
            scale={xScale}
            stroke={colors.axis}
            tickStroke={colors.axis}
            numTicks={Math.min(6, buckets.length)}
            tickLabelProps={() => ({
              fill: colors.axis,
              fontSize: 9,
              fontFamily: 'monospace',
              textAnchor: 'middle' as const,
              dy: 4,
            })}
            tickFormat={(v) => Number(v).toLocaleString()}
            label="Block height"
            labelProps={{
              fill: colors.axis,
              fontSize: 10,
              fontFamily: 'monospace',
              textAnchor: 'middle',
            }}
            labelOffset={16}
          />
          <rect
            width={innerWidth}
            height={innerHeight}
            fill="transparent"
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setTooltip(null)}
          />
        </Group>
      </svg>
      {tooltip &&
        createPortal(
          <div
            className="pointer-events-none fixed z-[9999] rounded-md border border-cipher-border/50 bg-cipher-surface-solid/95 px-2.5 py-1.5 text-[10px] font-mono shadow-xl backdrop-blur-md"
            style={{ left: tooltip.x + 12, top: tooltip.y - 60 }}
          >
            <div className="mb-1 text-muted">Block ~{tooltip.bucket.height.toLocaleString()}</div>
            {GRADES.filter((g) => tooltip.bucket[g] > 0).map((g) => (
              <div key={g} className="flex items-center gap-1.5">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: gradeColors[g] }}
                />
                <span className="text-secondary">{GRADE_LABELS[g]}:</span>
                <span className="text-primary">
                  {tooltip.bucket[g].toLocaleString(undefined, { maximumFractionDigits: 1 })} ZEC
                </span>
                {tooltip.total > 0 && (
                  <span className="text-muted">
                    ({((tooltip.bucket[g] / tooltip.total) * 100).toFixed(0)}%)
                  </span>
                )}
              </div>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
