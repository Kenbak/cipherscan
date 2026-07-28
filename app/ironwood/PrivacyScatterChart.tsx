'use client';

import {
  useRef,
  useEffect,
  useMemo,
  useCallback,
  useState,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { scaleLinear, scaleLog } from '@visx/scale';
import { AxisLeft, AxisBottom } from '@visx/axis';
import { GridRows } from '@visx/grid';
import { Group } from '@visx/group';
import { Line } from '@visx/shape';
import { Delaunay } from 'd3-delaunay';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ScatterPoint {
  x: number;
  y: number;
  txid: string;
  privacy: string;
  matched: number | null;
  iwActions?: number;
}

export interface PrivacyScatterChartProps {
  data: ScatterPoint[];
  width: number;
  height: number;
  colors: {
    axis: string;
    gridStroke: string;
    denominated: string;
    cursor: string;
  };
  privacyColors: {
    best: string;
    denomPadded: string;
    distinctUnpadded: string;
    worst: string;
  };
  referenceLines: { value: number; label: string }[];
  onDotClick?: (txid: string) => void;
}

// ─── Layout ──────────────────────────────────────────────────────────────────

const margin = { top: 12, right: 56, bottom: 52, left: 56 };
const Y_MIN = 0.001;
const VORONOI_RADIUS = 24;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getPointColor(
  p: ScatterPoint,
  pc: PrivacyScatterChartProps['privacyColors'],
): string {
  const isDenom = p.privacy === 'denominated';
  const isUnpadded = (p.iwActions ?? 0) <= 1;
  if (isDenom && isUnpadded) return pc.best;
  if (isDenom) return pc.denomPadded;
  if (isUnpadded) return pc.distinctUnpadded;
  return pc.worst;
}

function isPadded(p: ScatterPoint): boolean {
  return (p.iwActions ?? 0) > 1;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function PrivacyScatterChart({
  data,
  width,
  height,
  colors,
  privacyColors,
  referenceLines,
  onDotClick,
}: PrivacyScatterChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const innerWidth = Math.max(width - margin.left - margin.right, 0);
  const innerHeight = Math.max(height - margin.top - margin.bottom, 0);

  const [tooltip, setTooltip] = useState<{
    point: ScatterPoint;
    left: number;
    top: number;
  } | null>(null);

  // ─── Scales ──────────────────────────────────────────────────────────

  const xExtent = useMemo(() => {
    if (!data.length) return [0, 1] as [number, number];
    let min = Infinity;
    let max = -Infinity;
    for (const p of data) {
      if (p.x < min) min = p.x;
      if (p.x > max) max = p.x;
    }
    const pad = Math.max((max - min) * 0.02, 1);
    return [min - pad, max + pad] as [number, number];
  }, [data]);

  const yMax = useMemo(() => {
    if (!data.length) return 100;
    let max = 0;
    for (const p of data) {
      if (p.y > max) max = p.y;
    }
    return Math.max(max * 1.3, 1);
  }, [data]);

  const xScale = useMemo(
    () =>
      scaleLinear<number>({
        domain: xExtent,
        range: [0, innerWidth],
      }),
    [xExtent, innerWidth],
  );

  const yScale = useMemo(
    () =>
      scaleLog<number>({
        domain: [Y_MIN, yMax],
        range: [innerHeight, 0],
        base: 10,
        clamp: true,
      }),
    [yMax, innerHeight],
  );

  // ─── Voronoi for fast mouse hit-testing ──────────────────────────────

  const pixelPoints = useMemo(() => {
    return data.map((p) => ({
      px: xScale(p.x),
      py: yScale(Math.max(p.y, Y_MIN)),
      point: p,
    }));
  }, [data, xScale, yScale]);

  const voronoi = useMemo(() => {
    if (!pixelPoints.length) return null;
    return Delaunay.from(pixelPoints.map((pp) => [pp.px, pp.py] as [number, number]));
  }, [pixelPoints]);

  // ─── Canvas Rendering ────────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !pixelPoints.length) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
    canvas.style.width = `${innerWidth}px`;
    canvas.style.height = `${innerHeight}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, innerWidth, innerHeight);

    for (const { px, py, point } of pixelPoints) {
      if (px < -5 || py < -5 || px > innerWidth + 5 || py > innerHeight + 5)
        continue;

      const color = getPointColor(point, privacyColors);
      const padded = isPadded(point);
      const isHovered = tooltip?.point.txid === point.txid;

      const size = isHovered ? 6 : 4;

      ctx.globalAlpha = isHovered ? 1 : 0.88;

      if (padded) {
        ctx.beginPath();
        ctx.moveTo(px, py - size);
        ctx.lineTo(px + size, py);
        ctx.lineTo(px, py + size);
        ctx.lineTo(px - size, py);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(px, py, size, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
      }

      if (isHovered) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.9;
        if (padded) {
          ctx.beginPath();
          ctx.moveTo(px, py - size);
          ctx.lineTo(px + size, py);
          ctx.lineTo(px, py + size);
          ctx.lineTo(px - size, py);
          ctx.closePath();
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.arc(px, py, size, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    }

    ctx.globalAlpha = 1;
  }, [pixelPoints, privacyColors, innerWidth, innerHeight, tooltip?.point.txid]);

  // ─── Mouse interaction ───────────────────────────────────────────────

  const findNearest = useCallback(
    (mx: number, my: number): typeof pixelPoints[number] | null => {
      if (!voronoi || !pixelPoints.length) return null;
      const idx = voronoi.find(mx, my);
      const pp = pixelPoints[idx];
      if (!pp) return null;
      const dx = pp.px - mx;
      const dy = pp.py - my;
      if (dx * dx + dy * dy > VORONOI_RADIUS * VORONOI_RADIUS) return null;
      return pp;
    },
    [voronoi, pixelPoints],
  );

  const getCanvasCoords = useCallback(
    (event: ReactMouseEvent<HTMLCanvasElement>): { x: number; y: number } | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };
    },
    [],
  );

  const handleMouseMove = useCallback(
    (event: ReactMouseEvent<HTMLCanvasElement>) => {
      const coords = getCanvasCoords(event);
      if (!coords) { setTooltip(null); return; }
      const pp = findNearest(coords.x, coords.y);
      if (pp) {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        setTooltip({
          point: pp.point,
          left: rect.left + pp.px,
          top: rect.top + pp.py,
        });
      } else {
        setTooltip(null);
      }
    },
    [getCanvasCoords, findNearest],
  );

  const handleMouseLeave = useCallback(() => {
    setTooltip(null);
  }, []);

  const handleClick = useCallback(
    (event: ReactMouseEvent<HTMLCanvasElement>) => {
      const coords = getCanvasCoords(event);
      if (!coords || !onDotClick) return;
      const pp = findNearest(coords.x, coords.y);
      if (pp?.point.txid) onDotClick(pp.point.txid);
    },
    [getCanvasCoords, findNearest, onDotClick],
  );

  // ─── Axis formatting ────────────────────────────────────────────────

  const xTickFormat = useCallback(
    (v: number) => v.toLocaleString(),
    [],
  );

  const yTickValues = [0.001, 0.01, 0.1, 1, 10, 100, 1000, 10000];
  const yTickFormat = useCallback((v: number) => {
    if (v >= 1000) return `${(v / 1000).toFixed(0)}k`;
    return `${v}`;
  }, []);

  if (width < 10 || height < 10) return null;

  return (
    <div className="relative" style={{ width, height }}>
      {/* SVG layer: axes, grid, reference lines */}
      <svg
        width={width}
        height={height}
        className="absolute inset-0"
        style={{ pointerEvents: 'none' }}
      >
        <Group left={margin.left} top={margin.top}>
          <GridRows
            scale={yScale}
            width={innerWidth}
            stroke={colors.gridStroke}
            strokeDasharray="2 6"
            numTicks={6}
          />

          {/* Reference denomination lines */}
          {referenceLines.map(({ value, label }) => {
            const yPos = yScale(value);
            if (yPos < 0 || yPos > innerHeight) return null;
            return (
              <g key={value}>
                <Line
                  from={{ x: 0, y: yPos }}
                  to={{ x: innerWidth, y: yPos }}
                  stroke={colors.denominated}
                  strokeOpacity={0.38}
                  strokeWidth={1.5}
                  strokeDasharray="5 4"
                />
                <text
                  x={innerWidth + 4}
                  y={yPos}
                  dy="0.32em"
                  fontSize={9}
                  fontFamily="var(--font-mono)"
                  fill={colors.denominated}
                  opacity={0.75}
                >
                  {label}
                </text>
              </g>
            );
          })}

          <AxisBottom
            scale={xScale}
            top={innerHeight}
            stroke={colors.axis}
            tickStroke={colors.axis}
            tickLabelProps={() => ({
              fill: colors.axis,
              fontSize: 10,
              fontFamily: 'var(--font-mono)',
              textAnchor: 'middle' as const,
              dy: '0.25em',
            })}
            tickFormat={(v) => xTickFormat(v as number)}
            numTicks={Math.min(Math.floor(innerWidth / 80), 8)}
            label="Block height"
            labelProps={{
              fill: colors.axis,
              fontSize: 10,
              fontFamily: 'var(--font-mono)',
              textAnchor: 'middle' as const,
              dy: 8,
            }}
          />

          <AxisLeft
            scale={yScale}
            stroke={colors.axis}
            tickStroke={colors.axis}
            tickValues={yTickValues.filter((v) => v <= yMax && v >= Y_MIN)}
            tickFormat={(v) => yTickFormat(v as number)}
            tickLabelProps={() => ({
              fill: colors.axis,
              fontSize: 10,
              fontFamily: 'var(--font-mono)',
              textAnchor: 'end' as const,
              dx: '-0.3em',
              dy: '0.32em',
            })}
            label="Amount (ZEC)"
            labelProps={{
              fill: colors.axis,
              fontSize: 10,
              fontFamily: 'var(--font-mono)',
              textAnchor: 'middle' as const,
            }}
          />
        </Group>
      </svg>

      {/* Canvas layer: dots — positioned inside the margin area */}
      <canvas
        ref={canvasRef}
        className="absolute cursor-crosshair"
        style={{
          left: margin.left,
          top: margin.top,
          width: innerWidth,
          height: innerHeight,
        }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
      />

      {/* Tooltip — rendered via portal so it's never clipped */}
      {tooltip && createPortal(
        <div
          className="pointer-events-none fixed z-[9999]"
          style={{
            left: tooltip.left,
            top: tooltip.top,
            transform: `translate(-50%, calc(-100% - 12px))`,
          }}
        >
          <ScatterTooltip point={tooltip.point} privacyColors={privacyColors} />
        </div>,
        document.body,
      )}
    </div>
  );
}

// ─── Tooltip content ─────────────────────────────────────────────────────────

function ScatterTooltip({
  point,
  privacyColors,
}: {
  point: ScatterPoint;
  privacyColors: PrivacyScatterChartProps['privacyColors'];
}) {
  const actions = point.iwActions ?? 0;
  const isDenom = point.privacy === 'denominated';
  const isUnpadded = actions <= 1;

  const gradeColor = isDenom && isUnpadded
    ? privacyColors.best
    : isDenom
      ? privacyColors.denomPadded
      : isUnpadded
        ? privacyColors.distinctUnpadded
        : privacyColors.worst;

  const gradeLabel = isDenom && isUnpadded
    ? 'Best privacy'
    : isDenom
      ? 'Correct amount \u00b7 padded bundle'
      : isUnpadded
        ? 'Distinctive amount \u00b7 unpadded'
        : 'Distinctive amount \u00b7 padded bundle';

  return (
    <div className="rounded-lg border border-glass-8 bg-cipher-surface-solid px-3 py-2 text-xs font-mono pointer-events-none">
      <div className="mb-1 text-muted">Block #{point.x.toLocaleString()}</div>
      <div className="font-bold text-primary">{point.y.toFixed(8)} ZEC</div>
      {isDenom && point.matched != null && (
        <div className="mt-1 text-muted">Matches {point.matched} ZEC denomination</div>
      )}
      <div className="mt-1 font-semibold" style={{ color: gradeColor }}>
        {gradeLabel}
      </div>
      {actions > 0 && (
        <div className="mt-0.5 text-muted">
          {actions} Ironwood action{actions !== 1 ? 's' : ''}
        </div>
      )}
      <div className="mt-2 text-[10px] text-cipher-cyan-bright">
        Click to view transaction &rarr;
      </div>
    </div>
  );
}
