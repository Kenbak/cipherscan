export type HashrateWindow = '24h' | '7d';
export interface HashrateEstimate {
  hashrate: number | null;
  blockCount: number;
  windowSeconds: number;
  windowStart: string;
  windowEnd: string;
  unavailableReason: string | null;
  method: 'target-work-v1';
}
export interface HashrateSnapshot {
  asOf: string;
  tipHeight: number | null;
  windows: Record<HashrateWindow, HashrateEstimate>;
}
export interface HashrateStats {
  mining?: { networkHashrate?: string; hashrateEstimate?: HashrateSnapshot };
}
export const HASHRATE_DESCRIPTION = 'Estimated solutions per second from canonical block target work over the full trailing 24 hours. Uses block-header timestamps; orphaned blocks are excluded.';

/** Refuse old daily data when a new window is loading; never relabel retained data. */
export function hashrateChartPoints(
  history: { window?: string; method?: string; points?: (HashrateEstimate & { date: string })[] } | null,
  window: HashrateWindow,
  snapshot?: HashrateSnapshot,
) {
  if (history?.window !== window || history?.method !== 'target-work-v1') return [];
  const current = snapshot?.windows[window];
  const points = (history.points ?? []).filter(point => !current || point.date < current.windowEnd);
  const samples = current ? [...points, { ...current, date: current.windowEnd }] : points;
  return samples.map(point => ({ ...point, timestamp: Date.parse(point.windowEnd ?? point.date) }));
}
