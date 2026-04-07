'use client';

import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';

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
  color = '#5B9CF6',
}: PrivacyTimelineChartProps) {
  if (points.length === 0) {
    return null;
  }

  return (
    <div className="w-full rounded-xl border border-cipher-border bg-cipher-surface/30 p-3">
      <div className="h-full" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 8, right: 8, bottom: compact ? 0 : 8, left: compact ? 0 : 8 }}>
            <CartesianGrid stroke="#ffffff12" vertical={false} />
            <XAxis
              dataKey="timestamp"
              domain={['dataMin', 'dataMax']}
              type="number"
              hide={compact}
              tickFormatter={(value) => new Date(value * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              stroke="#94A3B8"
              fontSize={10}
            />
            <YAxis
              dataKey="value"
              hide={compact}
              stroke="#94A3B8"
              fontSize={10}
              width={36}
              tickFormatter={(value) => `${value}`}
              label={compact ? undefined : { value: yLabel, angle: -90, position: 'insideLeft', fill: '#94A3B8', fontSize: 10 }}
            />
            <Tooltip
              cursor={{ strokeDasharray: '3 3', stroke: '#56D4C8' }}
              content={({ active, payload }) => {
                if (!active || !payload || payload.length === 0) return null;
                const point = payload[0].payload as PrivacyTimelinePoint;
                return (
                  <div className="rounded-lg border border-cipher-border bg-cipher-bg/95 px-3 py-2 text-xs shadow-xl">
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
            <Scatter data={points} fill={color} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
