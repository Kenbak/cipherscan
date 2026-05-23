'use client';

interface ChartWatermarkProps {
  className?: string;
  label?: string;
  /** chart = inside chart cards; map = full-width node map */
  variant?: 'chart' | 'map';
}

/** Subtle brand watermark for charts and maps */
export function ChartWatermark({ className = '', label = 'CIPHERSCAN', variant = 'chart' }: ChartWatermarkProps) {
  const fontSize = variant === 'map' ? 'clamp(1.75rem, 4vw, 3rem)' : 'clamp(1.25rem, 3vw, 2rem)';

  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-0 z-0 flex items-center justify-center overflow-hidden select-none ${className}`}
    >
      <span
        className="font-mono font-bold uppercase tracking-[0.35em] whitespace-nowrap"
        style={{
          color: 'var(--color-text-primary)',
          opacity: 0.035,
          transform: 'rotate(-12deg)',
          fontSize,
        }}
      >
        {label}
      </span>
    </div>
  );
}
