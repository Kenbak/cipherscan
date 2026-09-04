'use client';

import Link from 'next/link';

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className = '',
}: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
  className?: string;
}) {
  return (
    <div
      className={`flex w-full rounded-lg border border-cipher-border/35 bg-glass-3/50 p-1 sm:w-auto sm:gap-1.5 sm:rounded-none sm:border-0 sm:bg-transparent sm:p-0 ${className}`}
    >
      {options.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          className={`flex-1 rounded-md py-1.5 text-[11px] font-mono transition-all sm:flex-none sm:rounded-full sm:border sm:px-2.5 sm:py-0.5 sm:text-[10px] ${
            value === id
              ? 'bg-cipher-yellow/15 text-cipher-yellow-bright shadow-sm sm:border-cipher-yellow/40 sm:bg-cipher-yellow/10 sm:shadow-none'
              : 'text-muted hover:text-primary sm:border-cipher-border/50 sm:hover:border-cipher-border'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function KpiRow({
  label,
  value,
  hint,
  href,
  scrollTo,
  toneColor,
}: {
  label: string;
  value: string;
  hint?: string;
  href?: string;
  scrollTo?: string;
  toneColor?: string;
}) {
  const className =
    'group flex items-center justify-between gap-4 px-4 py-3.5 transition-colors hover:bg-cipher-hover active:bg-cipher-hover';

  const body = (
    <>
      <div className="min-w-0">
        <div className="font-mono text-[11px] text-primary">{label}</div>
        {hint ? (
          <div className="mt-0.5 truncate font-mono text-[10px] text-muted/60 group-hover:text-muted/80">{hint}</div>
        ) : null}
      </div>
      <div
        className="shrink-0 text-right font-mono text-sm font-bold tabular-nums text-primary"
        style={toneColor ? { color: toneColor } : undefined}
      >
        {value}
      </div>
    </>
  );

  if (href) {
    return (
      <Link href={href} className={className}>
        {body}
      </Link>
    );
  }

  if (scrollTo) {
    return (
      <a href={scrollTo} className={className}>
        {body}
      </a>
    );
  }

  return <div className={className}>{body}</div>;
}

export function KpiCell({
  label,
  value,
  hint,
  href,
  scrollTo,
  toneColor,
}: {
  label: string;
  value: string;
  hint?: string;
  href?: string;
  scrollTo?: string;
  toneColor?: string;
}) {
  const className =
    'group min-w-0 px-3 py-3 transition-colors hover:bg-cipher-hover sm:px-4 sm:py-3.5';

  const body = (
    <>
      <div
        className="text-base font-bold font-mono tabular-nums text-primary lg:text-lg"
        style={toneColor ? { color: toneColor } : undefined}
      >
        {value}
      </div>
      <div className="mt-0.5 truncate font-mono text-[10px] uppercase tracking-wider text-muted">{label}</div>
      {hint ? (
        <div className="mt-0.5 truncate font-mono text-[10px] text-muted/60 group-hover:text-muted/80">
          {hint}
        </div>
      ) : null}
    </>
  );

  if (href) {
    return (
      <Link href={href} className={className}>
        {body}
      </Link>
    );
  }

  if (scrollTo) {
    return (
      <a href={scrollTo} className={className}>
        {body}
      </a>
    );
  }

  return <div className={className}>{body}</div>;
}

export function EmptyPanel({
  activated,
  message,
}: {
  activated: boolean;
  message?: string;
}) {
  return (
    <div className="h-[140px] flex items-center justify-center rounded-lg border border-dashed border-cipher-border/50 bg-glass-3">
      <p className="text-xs text-muted font-mono">
        {message ?? (activated ? 'No migrations indexed yet' : 'Populates at activation')}
      </p>
    </div>
  );
}
