'use client';

export interface PrivacyEventPoint {
  id: string;
  title: string;
  subtitle?: string;
  timestamp: number;
  tone?: 'shield' | 'deshield' | 'neutral';
}

interface PrivacyEventRailProps {
  points: PrivacyEventPoint[];
  mode?: 'absolute' | 'relative';
  className?: string;
  layout?: 'timeline' | 'stacked';
}

function formatAbsolute(timestamp: number) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(timestamp * 1000));
}

function formatRelative(seconds: number) {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;
  return `${Math.round(seconds / 86400)}d`;
}

function toneClasses(tone: PrivacyEventPoint['tone']) {
  switch (tone) {
    case 'shield':
      return {
        ring: 'ring-cipher-purple/40',
        fill: 'bg-cipher-purple',
        text: 'text-cipher-purple',
      };
    case 'deshield':
      return {
        ring: 'ring-cipher-orange/40',
        fill: 'bg-cipher-orange',
        text: 'text-cipher-orange',
      };
    default:
      return {
        ring: 'ring-cipher-cyan/40',
        fill: 'bg-cipher-cyan',
        text: 'text-cipher-cyan',
      };
  }
}

export function PrivacyEventRail({
  points,
  mode = 'absolute',
  className = '',
  layout = 'timeline',
}: PrivacyEventRailProps) {
  if (points.length === 0) return null;

  const ordered = [...points].sort((a, b) => a.timestamp - b.timestamp);
  const minTs = ordered[0].timestamp;
  const maxTs = ordered[ordered.length - 1].timestamp;
  const span = Math.max(maxTs - minTs, 1);

  if (layout === 'stacked') {
    return (
      <div className={`rounded-2xl border border-cipher-border bg-cipher-surface/20 p-4 ${className}`}>
        <div className="space-y-0">
          {ordered.map((point, index) => {
            const classes = toneClasses(point.tone);

            return (
              <div key={point.id} className="grid grid-cols-[auto_1fr] gap-3">
                <div className="flex flex-col items-center">
                  <div className={`mt-1 inline-flex h-4 w-4 items-center justify-center rounded-full ring-4 ${classes.ring}`}>
                    <div className={`h-2.5 w-2.5 rounded-full ${classes.fill}`} />
                  </div>
                  {index < ordered.length - 1 && (
                    <div className="my-1 h-full min-h-8 w-px bg-cipher-border/60" />
                  )}
                </div>

                <div className={`pb-4 ${index === ordered.length - 1 ? 'pb-0' : ''}`}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className={`text-[10px] font-mono uppercase tracking-[0.18em] ${classes.text}`}>
                      {point.title}
                    </p>
                    <p className="text-xs font-medium text-primary">
                      {mode === 'relative' && index > 0
                        ? `+${formatRelative(point.timestamp - minTs)}`
                        : formatAbsolute(point.timestamp)}
                    </p>
                  </div>
                  {point.subtitle && (
                    <p className="mt-1 text-[11px] leading-relaxed text-secondary break-words">
                      {point.subtitle}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (ordered.length <= 2) {
    return (
      <div className={`rounded-2xl border border-cipher-border bg-cipher-surface/20 p-4 ${className}`}>
        <div className="relative">
          <div className="absolute left-4 right-4 top-2 h-px bg-gradient-to-r from-cipher-purple/40 via-cipher-cyan/30 to-cipher-orange/40" />
          <div className="grid grid-cols-2 gap-6 pt-0">
            {ordered.map((point, index) => {
              const classes = toneClasses(point.tone);
              const isStart = index === 0;

              return (
                <div
                  key={point.id}
                  className={`relative ${isStart ? 'text-left' : 'text-right'}`}
                >
                  <div className={`mb-3 inline-flex h-4 w-4 items-center justify-center rounded-full ring-4 ${classes.ring}`}>
                    <div className={`h-2.5 w-2.5 rounded-full ${classes.fill}`} />
                  </div>
                  <p className={`text-[10px] font-mono uppercase tracking-[0.18em] ${classes.text}`}>
                    {point.title}
                  </p>
                  <p className="mt-1 text-xs font-medium text-primary">
                    {mode === 'relative' && index > 0
                      ? `+${formatRelative(point.timestamp - minTs)}`
                      : formatAbsolute(point.timestamp)}
                  </p>
                  {point.subtitle && (
                    <p className={`mt-1 text-[11px] leading-relaxed text-secondary break-words ${isStart ? 'max-w-[10rem]' : 'ml-auto max-w-[10rem]'}`}>
                      {point.subtitle}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-2xl border border-cipher-border bg-cipher-surface/20 p-4 ${className}`}>
      <div className="relative min-h-[122px]">
        <div className="absolute left-4 right-4 top-10 h-px bg-gradient-to-r from-cipher-purple/40 via-cipher-cyan/30 to-cipher-orange/40" />
        {ordered.map((point, index) => {
          const left = ordered.length === 1
            ? 0.5
            : (point.timestamp - minTs) / span;
          const classes = toneClasses(point.tone);

          return (
            <div
              key={point.id}
              className="absolute top-0 w-32 sm:w-36 -translate-x-1/2"
              style={{ left: `calc(16px + ${left * 100}% * ((100% - 32px) / 100))` }}
            >
              <div className="flex flex-col items-center text-center">
                <div className={`mb-3 inline-flex h-4 w-4 items-center justify-center rounded-full ring-4 ${classes.ring}`}>
                  <div className={`h-2.5 w-2.5 rounded-full ${classes.fill}`} />
                </div>
                <p className={`text-[10px] font-mono uppercase tracking-[0.18em] ${classes.text}`}>
                  {point.title}
                </p>
                <p className="mt-1 text-xs font-medium text-primary">
                  {mode === 'relative' && index > 0
                    ? `+${formatRelative(point.timestamp - minTs)}`
                    : formatAbsolute(point.timestamp)}
                </p>
                {point.subtitle && (
                  <p className="mt-1 max-w-[9rem] text-[11px] leading-relaxed text-secondary break-words">
                    {point.subtitle}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
