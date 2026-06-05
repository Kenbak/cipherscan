'use client';

import { useTheme } from '@/contexts/ThemeContext';
import { formatZecCompact } from '@/lib/format-numbers';
import { getFlowColors, TURNSTILE_CATEGORY_LABELS } from '@/lib/flow-colors';

interface TurnstileFunnelProps {
  totalDeshielded: number;
  heldPercent: number;
  reshieldedPercent: number;
  transferredPercent: number;
  exchangePercent: number;
  totalHeld: number;
  totalReshielded: number;
  totalTransferred: number;
  totalExchange: number;
}

/** Summary funnel: deshielded volume splitting into four outcomes. */
export function TurnstileFunnel({
  totalDeshielded,
  heldPercent,
  reshieldedPercent,
  transferredPercent,
  exchangePercent,
  totalHeld,
  totalReshielded,
  totalTransferred,
  totalExchange,
}: TurnstileFunnelProps) {
  const { theme } = useTheme();
  const colors = getFlowColors(theme);

  if (totalDeshielded <= 0) return null;

  const segments = [
    { key: 'held' as const, pct: heldPercent, amount: totalHeld },
    { key: 'reshielded' as const, pct: reshieldedPercent, amount: totalReshielded },
    { key: 'transferred' as const, pct: transferredPercent, amount: totalTransferred },
    { key: 'exchange' as const, pct: exchangePercent, amount: totalExchange },
  ].filter((s) => s.pct > 0.05);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-muted">
        <span className="opacity-50">{'>'}</span>
        <span>Where deshielded ZEC goes</span>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-stretch gap-2 sm:gap-0">
        <div
          className="sm:w-36 shrink-0 rounded-lg border px-3 py-2.5 flex flex-col justify-center"
          style={{
            borderColor: `${colors.deshielding}40`,
            backgroundColor: `${colors.deshielding}12`,
          }}
        >
          <p className="text-[10px] font-mono uppercase tracking-wider text-muted mb-0.5">Deshielded</p>
          <p className="text-sm font-bold font-mono tabular-nums" style={{ color: colors.deshielding }}>
            {formatZecCompact(totalDeshielded)}
          </p>
        </div>

        <div className="hidden sm:flex items-center px-2 text-muted opacity-40" aria-hidden>
          →
        </div>

        <div className="flex-1 grid grid-cols-2 lg:grid-cols-4 gap-2">
          {segments.map(({ key, pct, amount }) => (
            <div
              key={key}
              className="rounded-lg border px-3 py-2.5 border-l-2"
              style={{
                borderLeftColor: colors[key],
                backgroundColor: 'var(--glass-3)',
              }}
            >
              <p className="text-[10px] font-mono uppercase tracking-wider text-muted mb-0.5 truncate">
                {TURNSTILE_CATEGORY_LABELS[key]}
              </p>
              <p className="text-sm font-bold font-mono tabular-nums text-primary">
                {formatZecCompact(amount)}
              </p>
              <p className="text-[10px] font-mono text-muted mt-0.5">{pct.toFixed(1)}%</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
