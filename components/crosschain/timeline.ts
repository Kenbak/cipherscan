import type { Trend } from "./model";
/** Missing observations stay gaps; a daily aggregate is not complete if an hour is unknown. */
export function dailyTrends(trends: Trend[]): Trend[] {
  const groups = new Map<string, Trend[]>();
  for (const row of trends) {
    const date = row.bucket.slice(0, 10) + "T00:00:00.000Z";
    groups.set(date, [...(groups.get(date) || []), row]);
  }
  return Array.from(groups, ([bucket, rows]) => {
    const sum = (
      key: "inflow_usd" | "outflow_usd" | "inflow_zec" | "outflow_zec",
    ) =>
      rows.some((r) => r[key] == null)
        ? null
        : String(rows.reduce((n, r) => n + Number(r[key]), 0));
    return {
      bucket,
      swaps: rows.some((r) => r.swaps == null)
        ? null
        : rows.reduce((n, r) => n + r.swaps!, 0),
      inflow_usd: sum("inflow_usd"),
      outflow_usd: sum("outflow_usd"),
      inflow_zec: sum("inflow_zec"),
      outflow_zec: sum("outflow_zec"),
    };
  });
}
export function alignReference(
  dates: string[],
  rows: { date: string; priceUsd?: number | null; net?: number | null }[],
  field: "priceUsd" | "net",
) {
  const values = new Map(rows.map((r) => [r.date.slice(0, 10), r[field]]));
  return dates.map((label) => {
    const v = values.get(label.slice(0, 10));
    return {
      label,
      reference: v == null || !Number.isFinite(Number(v)) ? null : Number(v),
    };
  });
}
