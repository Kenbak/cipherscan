export type DisplayUnit = 'usd' | 'zec';

/**
 * Sign-aware USD formatter.
 * Negative values render as "−$78.9K" (Unicode minus), not "$-78912.50".
 */
export function formatUSD(value: number): string {
  const abs = Math.abs(value);
  const prefix = value < 0 ? '−' : '';
  if (abs >= 1_000_000) return `${prefix}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${prefix}$${(abs / 1_000).toFixed(1)}K`;
  return `${prefix}$${abs.toFixed(2)}`;
}

export function formatZec(value: number): string {
  const abs = Math.abs(value);
  const prefix = value < 0 ? '−' : '';
  if (abs >= 1_000_000) return `${prefix}${(abs / 1_000_000).toFixed(2)}M ZEC`;
  if (abs >= 10_000) return `${prefix}${(abs / 1_000).toFixed(1)}K ZEC`;
  if (abs >= 100) return `${prefix}${abs.toFixed(2)} ZEC`;
  if (abs >= 1) return `${prefix}${abs.toFixed(4)} ZEC`;
  return `${prefix}${abs.toFixed(6)} ZEC`;
}

/**
 * Unit-aware value formatter. Converts USD to ZEC when unit=zec.
 * Returns null if conversion is impossible (no price).
 */
export function formatValue(
  usdValue: number,
  unit: DisplayUnit,
  zecPrice: number | null,
): string {
  if (unit === 'zec') {
    if (!zecPrice || zecPrice <= 0) return formatUSD(usdValue);
    return formatZec(usdValue / zecPrice);
  }
  return formatUSD(usdValue);
}

/**
 * Format a raw token amount with appropriate precision.
 */
export function formatAmount(amount: number): string {
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(2)}M`;
  if (amount >= 10_000) return `${(amount / 1_000).toFixed(1)}K`;
  if (amount >= 100) return amount.toFixed(2);
  if (amount >= 1) return amount.toFixed(4);
  return amount.toFixed(6);
}

export function formatRelativeTime(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function formatMinutes(m: number): string {
  if (m <= 0) return '—';
  if (m < 60) return `${m.toFixed(0)}m`;
  return `${(m / 60).toFixed(1)}h`;
}

/**
 * Format a signed value with explicit +/− prefix (for net flow display).
 */
export function formatSignedUSD(value: number): string {
  if (value === 0) return '$0';
  const prefix = value > 0 ? '+' : '';
  return `${prefix}${formatUSD(value)}`;
}
