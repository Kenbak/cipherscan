/**
 * Format timestamp to relative time (e.g., "5 years ago", "2 hours ago")
 */
export function formatRelativeTime(timestamp: number, now = Date.now()): string {
  const diff = now - timestamp * 1000; // Convert to milliseconds

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  // Use more accurate rounding for years (show 2 years if > 1.5 years)
  if (days >= 547) { // ~1.5 years
    const accurateYears = Math.round(days / 365);
    return `${accurateYears} year${accurateYears > 1 ? 's' : ''} ago`;
  } else if (years > 0) {
    return `${years} year${years > 1 ? 's' : ''} ago`;
  } else if (months > 0) {
    return `${months} month${months > 1 ? 's' : ''} ago`;
  } else if (days > 0) {
    return `${days} day${days > 1 ? 's' : ''} ago`;
  } else if (hours > 0) {
    return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  } else if (minutes > 0) {
    return `${minutes} min${minutes > 1 ? 's' : ''} ago`;
  } else {
    return 'Just now';
  }
}

/** Format an observed interval. Classify only when its height's target is known. */
export function formatBlockInterval(seconds: number, targetSeconds: number | null = null): { label: string; level: 'unknown' | 'fast' | 'normal' | 'slow' | 'very-slow' } {
  if (!Number.isFinite(seconds)) return { label: '—', level: 'unknown' };
  const t = targetSeconds;
  let level: 'unknown' | 'fast' | 'normal' | 'slow' | 'very-slow';
  if (seconds < 0 || t === null || !Number.isFinite(t) || t <= 0) level = 'unknown';
  else if (seconds <= t * 0.5) level = 'fast';
  else if (seconds <= t * 2) level = 'normal';
  else if (seconds <= t * 4) level = 'slow';
  else level = 'very-slow';

  const magnitude = Math.abs(seconds);
  const sign = seconds < 0 ? '−' : '';
  if (magnitude < 60) return { label: `${sign}${magnitude}s`, level };
  const m = Math.floor(magnitude / 60);
  const s = magnitude % 60;
  return { label: s > 0 ? `${sign}${m}m ${s}s` : `${sign}${m}m`, level };
}

/**
 * Format a number with commas (e.g., 3851472 → "3,851,472").
 * Pure string manipulation — identical output on server and client.
 */
export function formatNumber(n: number): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Format timestamp to readable date (e.g., "Nov 6, 2019")
 */
export function formatDate(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatDateUTC(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short',
    hour12: false,
  });
}

/**
 * Format timestamp to full date and time
 */
export function formatDateTime(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Reverse the byte order of a 32-byte hex string (64 hex chars).
 *
 * zebrad's RPCs + block headers store Crosslink finalizer public keys in
 * one byte order; the Crosslink GUI displays them in the opposite order.
 * Sam Smith (ShieldedLabs) confirmed the GUI order is the canonical
 * user-facing one. This helper lets us keep raw RPC bytes in the DB but
 * show the GUI-style hex everywhere in the UI.
 *
 * Non-64-char inputs are returned unchanged (safe fallback for display
 * of unexpected values).
 */
export function displayPubkey(hex: string | null | undefined): string {
  if (!hex || hex.length !== 64) return hex ?? '';
  const bytes: string[] = [];
  for (let i = 0; i < 64; i += 2) bytes.push(hex.slice(i, i + 2));
  return bytes.reverse().join('');
}

/**
 * Parse a pubkey the user typed/pasted and produce the raw-RPC form we
 * store internally. If the user pasted a GUI-style hex we reverse it; if
 * they pasted a raw hex we leave it alone. This is a simple heuristic:
 * we always try both forms in lookup code — call this to get the "most
 * likely intended" form for a single-request lookup.
 */
export function normalizePubkeyForQuery(hex: string): string {
  return displayPubkey(hex.toLowerCase().trim());
}

/** Short chart date from a UTC date/ISO string or Unix seconds. */
export function formatDateLabelUTC(value: string | number): string {
  const date = new Date(typeof value === 'number' ? value * 1000 : value);
  if (!Number.isFinite(date.getTime())) return '—';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}
