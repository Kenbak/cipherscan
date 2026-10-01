/** Preserve non-monotonic timestamps and gaps rather than inventing intervals. */
export function blockIntervals(blocks: readonly { height: number; timestamp: number }[]) {
  const sorted = [...blocks].filter(b => Number.isInteger(b.height) && Number.isFinite(b.timestamp)).sort((a, b) => a.height - b.height);
  return sorted.slice(1).map((block, i) => ({
    height: block.height,
    timestamp: block.timestamp,
    seconds: block.height === sorted[i].height + 1 ? block.timestamp - sorted[i].timestamp : null,
  }));
}

export function blockAgeLabel(timestamp: number | undefined, now: number) {
  if (!timestamp || !Number.isFinite(timestamp)) return 'unavailable';
  const seconds = Math.floor(now / 1000 - timestamp);
  if (seconds < 0) return 'ahead of local clock';
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

export function observationStatus(node: { healthy?: boolean; ready?: boolean } | null | undefined) {
  if (!node || node.healthy == null || node.ready == null) return 'Unavailable';
  if (!node.healthy) return 'Degraded';
  return node.ready ? 'Ready' : 'Not ready';
}

/** API fee percentiles are in zatoshis; the rendered band is in mZEC. */
export function feeBand(day: { p10: number; median: number; p90: number }) {
  if (![day.p10, day.median, day.p90].every(Number.isFinite) || day.p10 < 0 || day.p10 > day.median || day.median > day.p90) return null;
  return { range: [day.p10 / 100_000, day.p90 / 100_000] as [number, number], median: day.median / 100_000 };
}
