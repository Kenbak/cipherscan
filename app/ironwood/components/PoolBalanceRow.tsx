'use client';

import { fmtValue, type CurrencyMode } from '@/hooks/useCurrencyToggle';
import type { PoolRow } from './types';

export function PoolBalanceRow({
  row,
  currencyMode,
  zecPrice,
}: {
  row: PoolRow;
  currencyMode: CurrencyMode;
  zecPrice: number | null;
}) {
  const rowShell = row.highlight
    ? 'bg-amber-500/[0.07] border border-amber-500/25'
    : 'border border-transparent';
  const nameClass = row.highlight ? 'font-medium' : 'text-secondary';
  const valueStyle = row.highlight ? { color: row.color } : undefined;

  return (
    <>
      {/* Mobile: compact single row — name left, value + % stacked right */}
      <div className={`sm:hidden flex items-center justify-between gap-2 py-1.5 px-2 rounded-md ${rowShell}`}>
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: row.color }} />
          <span className={`text-xs ${nameClass} truncate`} style={valueStyle}>{row.name}</span>
          {row.name === 'Orchard' && (
            <span
              title="Pending turnstile verification"
              className="text-[7px] px-1 py-px rounded-full font-mono border border-purple-500/30 bg-purple-500/10 text-purple-700 dark:text-purple-200/80 flex-shrink-0"
            >
              PT
            </span>
          )}
        </div>
        <div className="shrink-0 text-right tabular-nums leading-tight">
          <div
            className={`text-xs font-mono font-semibold ${row.highlight ? '' : 'text-primary'}`}
            style={valueStyle}
          >
            {fmtValue(row.zat, currencyMode, zecPrice)}
          </div>
          <div className="text-[10px] font-mono text-muted">{row.pct.toFixed(1)}%</div>
        </div>
      </div>

      {/* Desktop: single row */}
      <div className={`hidden sm:flex items-center justify-between py-2 px-3 rounded-lg ${rowShell}`}>
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: row.color }} />
          <span className={`text-sm ${nameClass}`} style={valueStyle}>{row.name}</span>
          {row.name === 'Orchard' && (
            <span
              title="Pending turnstile verification"
              className="text-[8px] px-1.5 py-0.5 rounded-full font-mono border border-purple-500/30 bg-purple-500/10 text-purple-700 dark:text-purple-200/80 flex-shrink-0"
            >
              pending
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 flex-shrink-0 tabular-nums">
          <span
            className={`text-sm font-mono font-semibold ${row.highlight ? '' : 'text-primary'}`}
            style={valueStyle}
          >
            {fmtValue(row.zat, currencyMode, zecPrice)}
          </span>
          <span className="text-[10px] font-mono text-muted w-12 text-right">{row.pct.toFixed(1)}%</span>
        </div>
      </div>
    </>
  );
}
