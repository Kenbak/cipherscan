'use client';

import { useState } from 'react';

export interface CompositionSegment {
  key: string;
  label: string;
  percent: number;
  color: string;
  /** Bar fill opacity, 0–1. Default 0.7 */
  opacity?: number;
  /** Optional subtitle after label in legend, e.g. "sitting at t-addr" */
  hint?: string;
  /** Native tooltip on bar segment */
  title?: string;
}

interface InteractiveCompositionBarProps {
  segments: CompositionSegment[];
  className?: string;
  /** Called when hover focus changes — use to highlight related stat cards */
  onHoverKeyChange?: (key: string | null) => void;
}

export function InteractiveCompositionBar({
  segments,
  className = '',
  onHoverKeyChange,
}: InteractiveCompositionBarProps) {
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  const visible = segments.filter(s => s.percent >= 0.05);

  function setHover(key: string | null) {
    setHoveredKey(key);
    onHoverKeyChange?.(key);
  }

  if (visible.length === 0) return null;

  return (
    <div className={className}>
      <div
        className="h-3 rounded-full overflow-hidden flex mb-3"
        style={{ backgroundColor: 'var(--color-bg)' }}
        role="img"
        aria-label="Composition breakdown"
      >
        {visible.map((segment, index) => {
          const isHovered = hoveredKey === segment.key;
          const isDimmed = hoveredKey != null && !isHovered;
          const opacity = segment.opacity ?? 0.7;
          const barOpacity = isDimmed ? opacity * 0.35 : isHovered ? Math.min(opacity + 0.2, 1) : opacity;

          return (
            <button
              key={segment.key}
              type="button"
              title={segment.title ?? `${segment.label}: ${segment.percent.toFixed(1)}%`}
              aria-label={`${segment.label}, ${segment.percent.toFixed(1)} percent`}
              className={`h-full transition-all duration-200 cursor-pointer border-0 p-0 min-w-[2px] ${
                index === 0 ? 'rounded-l-full' : ''
              } ${index === visible.length - 1 ? 'rounded-r-full' : ''} ${
                isHovered ? 'ring-1 ring-inset ring-white/25 z-10' : ''
              }`}
              style={{
                width: `${segment.percent}%`,
                backgroundColor: segment.color,
                opacity: barOpacity,
              }}
              onMouseEnter={() => setHover(segment.key)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(segment.key)}
              onBlur={() => setHover(null)}
            />
          );
        })}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-2 text-[10px] font-mono">
        {visible.map(segment => {
          const isHovered = hoveredKey === segment.key;
          const isDimmed = hoveredKey != null && !isHovered;

          return (
            <button
              key={segment.key}
              type="button"
              className={`inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 -mx-1.5 transition-all duration-200 cursor-pointer border-0 bg-transparent ${
                isHovered
                  ? 'text-primary bg-glass-4 ring-1 ring-glass-12'
                  : isDimmed
                    ? 'text-muted/40'
                    : 'text-muted hover:text-secondary'
              }`}
              onMouseEnter={() => setHover(segment.key)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(segment.key)}
              onBlur={() => setHover(null)}
            >
              <span
                className="w-2 h-2 rounded-full shrink-0 transition-transform duration-200"
                style={{
                  backgroundColor: segment.color,
                  opacity: segment.opacity ?? 0.85,
                  transform: isHovered ? 'scale(1.25)' : 'scale(1)',
                }}
                aria-hidden
              />
              <span>
                {segment.label}
                {segment.hint && (
                  <span className={isHovered ? 'opacity-70' : 'opacity-60'}> — {segment.hint}</span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
