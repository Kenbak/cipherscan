'use client';

const PERIODS = ['7d', '30d', '90d', '1y', 'all'] as const;
export type Period = typeof PERIODS[number];

export function PeriodSelector({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  return (
    <div className="inline-flex gap-0 p-0.5 rounded-md bg-glass-3 flex-shrink-0">
      {PERIODS.map(p => (
        <button
          key={p}
          onClick={() => onChange(p)}
          className={`px-1.5 py-0.5 text-[10px] font-mono rounded transition-all whitespace-nowrap ${
            value === p
              ? 'bg-cipher-cyan/15 text-cipher-cyan font-bold'
              : 'text-muted hover:text-primary'
          }`}
        >
          {p.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
