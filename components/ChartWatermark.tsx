'use client';

interface ChartWatermarkProps {
  className?: string;
  label?: string;
}

/** Subtle brand watermark for charts and maps */
export function ChartWatermark({ className = '', label = 'CIPHERSCAN' }: ChartWatermarkProps) {
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden select-none ${className}`}
    >
      <span className="font-mono text-[clamp(2.5rem,12vw,5.5rem)] font-bold uppercase tracking-[0.35em] text-primary/[0.04] rotate-[-12deg] whitespace-nowrap">
        {label}
      </span>
    </div>
  );
}
