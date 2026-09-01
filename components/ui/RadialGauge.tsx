'use client';

/** Score-band color used consistently across health/reliability visuals. */
export function scoreColor(value: number): string {
  if (value >= 80) return '#34D399';
  if (value >= 60) return '#F4B728';
  return '#EF4444';
}

interface RadialGaugeProps {
  /** 0-100 */
  value: number;
  size?: number;
  strokeWidth?: number;
  /** Small caption under the number, e.g. "SCORE" */
  label?: string;
  className?: string;
}

/**
 * Compact circular progress ring for a single hero score. Replaces a plain
 * corner number with a glanceable Apple-style gauge — the ring shape carries
 * "how full" at a glance, the color band carries "is this good," and the
 * number carries the precise value.
 */
export function RadialGauge({ value, size = 64, strokeWidth = 6, label, className = '' }: RadialGaugeProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped / 100);
  const color = scoreColor(clamped);

  return (
    <div className={`relative inline-flex items-center justify-center shrink-0 ${className}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-cipher-border/40"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{
            transition: 'stroke-dashoffset 0.6s ease',
            filter: `drop-shadow(0 0 5px ${color}66)`,
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-bold font-mono tabular-nums" style={{ color }}>
          {Math.round(clamped)}
        </span>
        {label && <span className="text-[8px] text-muted uppercase tracking-wider">{label}</span>}
      </div>
    </div>
  );
}
