'use client';

export type WatermarkSize = 'sm' | 'md' | 'lg' | 'map';

interface ChartWatermarkProps {
  className?: string;
  label?: string;
  size?: WatermarkSize;
}

const SIZE_CONFIG: Record<WatermarkSize, { fontSize: string; letterSpacing: string; opacity: number }> = {
  sm: {
    fontSize: 'clamp(0.7rem, 1.6vw, 1rem)',
    letterSpacing: '0.04em',
    opacity: 0.03,
  },
  md: {
    fontSize: 'clamp(0.85rem, 2vw, 1.25rem)',
    letterSpacing: '0.04em',
    opacity: 0.035,
  },
  lg: {
    fontSize: 'clamp(1rem, 2.8vw, 1.65rem)',
    letterSpacing: '0.03em',
    opacity: 0.035,
  },
  map: {
    fontSize: 'clamp(1.25rem, 4vw, 2.25rem)',
    letterSpacing: '0.02em',
    opacity: 0.03,
  },
};

/** Subtle brand watermark for charts and maps */
export function ChartWatermark({ className = '', label = 'cipherscan.app', size = 'md' }: ChartWatermarkProps) {
  const config = SIZE_CONFIG[size];

  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-0 z-0 flex items-center justify-center overflow-hidden select-none ${className}`}
    >
      <span
        className="font-mono font-semibold whitespace-nowrap"
        style={{
          color: 'var(--color-text-primary)',
          opacity: config.opacity,
          transform: 'rotate(-12deg)',
          fontSize: config.fontSize,
          letterSpacing: config.letterSpacing,
        }}
      >
        {label}
      </span>
    </div>
  );
}
