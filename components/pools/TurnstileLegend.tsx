'use client';

import { useTheme } from '@/contexts/ThemeContext';
import { getFlowColors, TURNSTILE_CATEGORY_LABELS } from '@/lib/flow-colors';

const CATEGORIES = ['held', 'reshielded', 'transferred', 'exchange'] as const;

export function TurnstileLegend({ className = '' }: { className?: string }) {
  const { theme } = useTheme();
  const colors = getFlowColors(theme);

  const hints: Record<(typeof CATEGORIES)[number], string> = {
    held: 'sitting at t-addr',
    reshielded: 'back to privacy',
    transferred: 'to another t-addr',
    exchange: 'labeled exchange addr',
  };

  return (
    <div
      className={`flex flex-wrap items-center gap-x-4 gap-y-2 text-[10px] font-mono text-muted ${className}`.trim()}
    >
      {CATEGORIES.map((key) => (
        <span key={key} className="inline-flex items-center gap-1.5">
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: colors[key] }}
            aria-hidden
          />
          <span>
            {TURNSTILE_CATEGORY_LABELS[key]}
            <span className="opacity-60"> — {hints[key]}</span>
          </span>
        </span>
      ))}
    </div>
  );
}
