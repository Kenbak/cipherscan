export interface HistoryPoint {
  date: string;
  sprout: number;
  sapling: number;
  orchard: number;
  ironwood: number;
  transparent: number;
  shielded: number;
  chainSupply: number | null;
  hasPoolBreakdown?: boolean;
}

/** A cap-based map needs every balance and its denominator from one observation. */
export function completeSupplyHistory(points: HistoryPoint[]): (HistoryPoint & { chainSupply: number })[] {
  return points.filter((point): point is HistoryPoint & { chainSupply: number } =>
    point.hasPoolBreakdown !== false && point.chainSupply != null && Number.isFinite(point.chainSupply) && point.chainSupply > 0 &&
    Number.isFinite(new Date(point.date).getTime()) &&
    [point.sprout, point.sapling, point.orchard, point.ironwood, point.transparent, point.shielded].every(value => Number.isFinite(value) && value >= 0)
  );
}
