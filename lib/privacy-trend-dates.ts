/** Parse privacy_trends_daily.date from API (DATE or ISO string). */
export function parseTrendDate(value: string | Date | number | null | undefined): Date {
  if (value == null) return new Date(NaN);
  if (value instanceof Date) return value;
  const raw = String(value).trim();
  if (!raw) return new Date(NaN);
  if (raw.includes('T')) return new Date(raw);
  return new Date(`${raw.slice(0, 10)}T00:00:00`);
}

export function formatTrendDate(value: string | Date | number | null | undefined): string {
  const d = parseTrendDate(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function normalizeTrendDateKey(value: string | Date | number | null | undefined): string {
  const d = parseTrendDate(value);
  if (Number.isNaN(d.getTime())) return String(value ?? '');
  return d.toISOString().slice(0, 10);
}

export function formatRelativeUpdated(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diffMs = Date.now() - then;
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
