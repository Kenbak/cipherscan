'use client';

import { useTheme } from '@/contexts/ThemeContext';
import { getChartColors } from '@/lib/chart-theme';
import { ChartWatermark } from '@/components/ChartWatermark';
import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,

  CartesianGrid,
} from 'recharts';
import { ChartTooltip as Tooltip } from '@/components/charts/ChartTooltip';

export interface PrivacyTimelinePoint {
  id: string;
  label: string;
  timestamp: number;
  value: number;
  score?: number;
  kind?: string;
}

interface PrivacyTimelineChartProps {
  points: PrivacyTimelinePoint[];
  height?: number;
  compact?: boolean;
  yLabel?: string;
  color?: string;
}

function formatTimestamp(timestamp: number) {
  return new Date(timestamp * 1000).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function PrivacyTimelineChart({
  points,
  height = 180,
  compact = false,
  yLabel = 'Value',
  color,
}: PrivacyTimelineChartProps) {
  const { theme } = useTheme();
  const colors = getChartColors(theme);
  if (points.length === 0) {
    return null;
  }

  return (
    <div className="w-full rounded-xl border border-cipher-border bg-cipher-surface/30 p-3">
      <div className="h-full" style={{ height }}>
        <ResponsiveContainer initialDimension={{ width: 500, height: 300 }} width="100%" height="100%">
          <ScatterChart margin={{ top: 8, right: 8, bottom: compact ? 0 : 8, left: compact ? 0 : 8 }}>
            <CartesianGrid stroke={colors.grid} vertical={false} />
            <XAxis
              dataKey="timestamp"
              domain={['dataMin', 'dataMax']}
              type="number"
              hide={compact}
              tickFormatter={(value) => new Date(value * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              stroke={colors.axis}
              fontSize={12}
            />
            <YAxis
              dataKey="value"
              hide={compact}
              stroke={colors.axis}
              fontSize={12}
              width={36}
              tickFormatter={(value) => `${value}`}
              label={compact ? undefined : { value: yLabel, angle: -90, position: 'insideLeft', fill: colors.axis, fontSize: 12 }}
            />
            <Tooltip
              cursor={{ strokeDasharray: '3 3', stroke: colors.cursor }}
              content={({ active, payload }) => {
                if (!active || !payload || payload.length === 0) return null;
                const point = payload[0].payload as PrivacyTimelinePoint;
                return (
                  <div className="chart-tooltip-surface">
                    <p className="font-mono text-primary">{point.label}</p>
                    <p className="text-secondary">{formatTimestamp(point.timestamp)}</p>
                    <p className="text-secondary">
                      {yLabel}: <span className="font-mono text-primary">{point.value}</span>
                    </p>
                    {point.score !== undefined && (
                      <p className="text-secondary">
                        Score: <span className="font-mono text-primary">{point.score}</span>
                      </p>
                    )}
                  </div>
                );
              }}
            />
            <Scatter data={points} fill={color ?? colors.transparent} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <ChartWatermark />
    </div>
  );
}
