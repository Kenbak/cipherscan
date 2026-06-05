'use client';

interface PeriodPillOption<T extends string> {
  key: T;
  label: string;
}

interface PeriodPillTagsProps<T extends string> {
  options: readonly PeriodPillOption<T>[];
  value: T;
  onChange: (key: T) => void;
  className?: string;
  'aria-label'?: string;
}

/**
 * Neutral period/filter pills — elevated active state, no brand cyan.
 * Cyan is reserved for links and primary CTAs; filters use surface contrast.
 */
export function PeriodPillTags<T extends string>({
  options,
  value,
  onChange,
  className = '',
  'aria-label': ariaLabel = 'Time period',
}: PeriodPillTagsProps<T>) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={`inline-flex flex-wrap gap-1 p-1 rounded-lg ${className}`.trim()}
      style={{ backgroundColor: 'var(--glass-3)' }}
    >
      {options.map(({ key, label }) => {
        const active = value === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            aria-pressed={active}
            className={`px-2.5 py-1.5 text-[10px] font-mono uppercase tracking-wider rounded-md transition-all whitespace-nowrap ${
              active
                ? 'bg-cipher-bg text-primary shadow-sm ring-1 ring-glass-12'
                : 'text-muted hover:text-secondary'
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
